import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';
import { Maybe } from '@ton/core/dist/utils/maybe';

export type DexRouterConfig = {
    ownerAddress: Address;
    poolCode: Cell;
    lpWalletCode: Cell;
};

export type AddLiquidityFP = {
    $$type: 'AddLiquidityFP';
    ton_amount: bigint;
    minLpAmount: bigint;
    master_address: Address;
    recipient: Maybe<Address>;
    fulfill_payload: Maybe<Cell>;
    reject_payload: Maybe<Cell>;
};

export type JettonTransferPool = {
    $$type: 'JettonTransfer';
    queryId: bigint;
    jettonAmount: bigint;
    to: Address;
    responseAddress: Maybe<Address>;
    customPayload: Maybe<Cell>;
    forwardTonAmount: bigint;
    forwardPayload: Maybe<AddLiquidityFP>;
};

export const DexRouterOpcode = {
    TopUp: 0xd372158c,
    AddLiquidity: 0x3ebe5431,
};

export function dexRouterConfigToCell(config: DexRouterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeRef(config.poolCode)
        .storeRef(config.lpWalletCode)
        .endCell();
}
/* Store */
export function storeAddLiquidityFP(value: AddLiquidityFP) {
    return (b: Builder) => {
        b.storeUint(DexRouterOpcode.AddLiquidity, 32);
        b.storeCoins(value.ton_amount);
        b.storeCoins(value.minLpAmount);
        b.storeAddress(value.master_address);
        b.storeAddress(value.recipient);
        b.storeMaybeRef(value.fulfill_payload);
        b.storeMaybeRef(value.reject_payload);
    };
}

export class DexRouter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new DexRouter(address);
    }

    static createFromConfig(config: DexRouterConfig, code: Cell, workchain = 0) {
        const data = dexRouterConfigToCell(config);
        const init = { code, data };
        return new DexRouter(contractAddress(workchain, init), init);
    }

    /* Pack */
    static packAddLiquidityFP(src: AddLiquidityFP) {
        return beginCell().store(storeAddLiquidityFP(src)).endCell();
    }

    static packJettonTransfer(src: JettonTransferPool) {
        let c = null;

        if (
            src.forwardPayload &&
            typeof src.forwardPayload === 'object' &&
            src.forwardPayload.$$type === 'AddLiquidityFP'
        ) {
            c = DexRouter.packAddLiquidityFP(src.forwardPayload);
        }
        return beginCell()
            .storeUint(0xf8a7ea5, 32)
            .storeUint(src.queryId, 64)
            .storeCoins(src.jettonAmount)
            .storeAddress(src.to)
            .storeAddress(src.responseAddress)
            .storeMaybeRef(src.customPayload)
            .storeCoins(src.forwardTonAmount)
            .storeMaybeRef(c)
            .endCell();
    }

    /* Send */

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(DexRouterOpcode.TopUp, 32).storeUint(0, 64).endCell(),
        });
    }

    /* Getters */

    async getPoolAddress(provider: ContractProvider, jettonMaster: Address): Promise<Address> {
        const poolAddress = await provider.get('get_pool_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(jettonMaster).endCell(),
            },
        ]);
        return poolAddress.stack.readAddress();
    }
}
