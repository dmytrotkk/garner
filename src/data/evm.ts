import { BaseError, ContractFunctionExecutionError, createClient, custom, erc20Abi } from 'viem'
import { getBalance, multicall } from 'viem/actions'
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from 'viem/chains'
import { z } from '../core/zod.ts'
import type { Fetch } from './host.ts'
import type { Address, AssetId, DeploymentId } from './schema.ts'

type Observed = { assetId: DeploymentId; quantity: string }

const chains = [
  { chain: mainnet, rpc: 'ethereum' },
  { chain: base, rpc: 'base' },
  { chain: arbitrum, rpc: 'arbitrum-one' },
  { chain: optimism, rpc: 'optimism' },
  { chain: polygon, rpc: 'polygon-bor' },
  { chain: bsc, rpc: 'bsc' },
  { chain: avalanche, rpc: 'avalanche-c-chain' },
] as const

export const chainName = (assetId: AssetId) =>
  chains.find(({ chain }) => assetId.startsWith(`eip155:${chain.id}/`))?.chain.name

const Rpc = z.object({
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
})

const batchSize = 8192

const connect = (fetch: Fetch, { chain, rpc }: (typeof chains)[number]) =>
  createClient({
    chain,
    transport: custom({
      async request(call) {
        const path = `/${rpc}` as const
        const { result, error } = Rpc.parse(
          await fetch('publicnode', path, { jsonrpc: '2.0', id: 1, ...call }),
        )
        if (error) throw new Error(error.message)
        return result
      },
    }),
  })

const root = (error: unknown): never => {
  throw error instanceof BaseError ? error.walk() : error
}

function settled<Result extends { error?: Error | undefined }>(results: Result[]): Result[] {
  for (const { error } of results)
    if (error instanceof ContractFunctionExecutionError && error.functionName === 'aggregate3')
      throw error.walk()
  return results
}

function tokens(assetIds: Iterable<AssetId>, chainId: number): Address[] {
  const prefix = `eip155:${chainId}/erc20:`
  return [...assetIds]
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length))
    .filter((address): address is Address => /^0x[0-9a-f]{40}$/.test(address))
}

export async function holdings(
  fetch: Fetch,
  owner: Address,
  universe: ReadonlySet<AssetId>,
): Promise<Observed[]> {
  const perChain = await Promise.all(
    chains.map(async (entry) => {
      const client = connect(fetch, entry)
      const { id } = entry.chain
      const addresses = tokens(universe, id)
      const [native, balances] = await Promise.all([
        getBalance(client, { address: owner }).catch(root),
        multicall(client, {
          batchSize,
          contracts: addresses.map((address) => ({
            address,
            abi: erc20Abi,
            functionName: 'balanceOf' as const,
            args: [owner] as const,
          })),
        }).then(settled),
      ])
      const nativeId: DeploymentId = `eip155:${id}/native`
      return [
        { assetId: nativeId, quantity: native },
        ...balances.flatMap(({ result }, index) => {
          const assetId: DeploymentId = `eip155:${id}/erc20:${addresses[index]}`
          return result === undefined ? [] : [{ assetId, quantity: result }]
        }),
      ]
    }),
  )
  return perChain
    .flat()
    .filter(({ assetId }) => universe.has(assetId))
    .map(({ assetId, quantity }) => ({ assetId, quantity: quantity.toString() }))
}

export async function decimals(
  fetch: Fetch,
  assetIds: readonly DeploymentId[],
): Promise<Map<DeploymentId, number>> {
  const perChain = await Promise.all(
    chains.map(async (entry) => {
      const { id, nativeCurrency } = entry.chain
      const nativeId: DeploymentId = `eip155:${id}/native`
      const addresses = tokens(assetIds, id)
      const results = addresses.length
        ? await multicall(connect(fetch, entry), {
            batchSize,
            contracts: addresses.map((address) => ({
              address,
              abi: erc20Abi,
              functionName: 'decimals' as const,
            })),
          }).then(settled)
        : []
      return [
        [nativeId, nativeCurrency.decimals] as const,
        ...results.flatMap(({ result }, index) => {
          const assetId: DeploymentId = `eip155:${id}/erc20:${addresses[index]}`
          return result === undefined ? [] : [[assetId, result] as const]
        }),
      ]
    }),
  )
  return new Map(perChain.flat())
}
