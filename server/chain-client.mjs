import {createPublicClient,fallback,http} from 'viem';
import {bsc} from 'viem/chains';

// Read-only endpoints. A failing provider cannot cause the worker to skip a page
// or invent balances; callers still pin financially related reads to one block.
export function createChainClient(primary){
 const urls=[...new Set([primary,'https://bsc-dataseed.bnbchain.org','https://bsc-rpc.publicnode.com'].filter(Boolean))];
 return createPublicClient({chain:bsc,transport:fallback(urls.map(url=>http(url,{timeout:8000,retryCount:0})),{rank:false,retryCount:1})});
}
