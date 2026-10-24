// Resolve each name once per snapshot, including after transfers. A definitive
// missing name excludes that player; uncertainty aborts the entire snapshot.
export async function resolveRewardIdentities(scores, operatingWallet, resolveName) {
  const names = new Map();
  const result = [];
  for (const row of scores) {
    if (row.gameWallet.toLowerCase() === operatingWallet.toLowerCase()) continue;
    const name = row.agentId.toLowerCase();
    if (!names.has(name)) {
      try { names.set(name, await resolveName(name)); }
      catch (error) {
        if (error.message !== 'agent_id_not_found') throw error;
        names.set(name, null);
      }
    }
    result.push({ ...row, approved: true, resolvedWallet: names.get(name) });
  }
  return result;
}
