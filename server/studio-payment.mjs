import { decodeFunctionData, decodeEventLog, erc20Abi, isAddress } from 'viem';

// A transaction buys exactly one saved game asset. No approvals or custody.
export async function verifyStudioPayment(client, invoice, hash, confirmations = 6, maxTransferTaxBps = 0) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '') || !isAddress(invoice.wallet)) throw new Error('studio_invalid_payment');
  if (await client.getChainId() !== 56) throw new Error('studio_wrong_chain');
  const [tx, receipt, tip] = await Promise.all([
    client.getTransaction({ hash }), client.getTransactionReceipt({ hash }), client.getBlockNumber(),
  ]);
  if (receipt.status !== 'success' || tx.from.toLowerCase() !== invoice.wallet.toLowerCase() ||
      tx.to?.toLowerCase() !== invoice.token_address.toLowerCase() || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('studio_invalid_payment');
  if (tip < receipt.blockNumber || tip - receipt.blockNumber + 1n < BigInt(confirmations)) throw new Error('studio_confirming');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash) throw new Error('studio_confirming');
  const timestamp = Number(block.timestamp) * 1000;
  if (timestamp < Math.floor(invoice.created_at/1000)*1000 || timestamp > invoice.expires_at) throw new Error('studio_payment_outside_invoice');
  let call;
  try { call = decodeFunctionData({ abi: erc20Abi, data: tx.input }); } catch { throw new Error('studio_invalid_payment'); }
  const expected = BigInt(invoice.raw_amount);
  if (call.functionName !== 'transfer' || call.args[0].toLowerCase() !== invoice.recipient.toLowerCase() || call.args[1] !== expected) throw new Error('studio_invalid_payment');
  let received = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== invoice.token_address.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: 'Transfer' });
      if (event.args.from.toLowerCase() === invoice.wallet.toLowerCase() && event.args.to.toLowerCase() === invoice.recipient.toLowerCase()) received += event.args.value;
    } catch { /* Other token events are not payment evidence. */ }
  }
  if (!Number.isInteger(maxTransferTaxBps) || maxTransferTaxBps < 0 || maxTransferTaxBps > 1000) throw new Error('studio_invalid_config');
  if (received < expected * BigInt(10000 - maxTransferTaxBps) / 10000n || received === 0n) throw new Error('studio_invalid_payment');
  return { hash: hash.toLowerCase(), block: String(receipt.blockNumber), received: String(received) };
}
