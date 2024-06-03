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
    tonAmount: bigint;
    minLpAmount: bigint;
    masterAddress: Address;
    recipient: Maybe<Address>;
    fulfillPayload: Maybe<Cell>;
    rejectPayload: Maybe<Cell>;
};

export type SwapJettonFP = {
    $$type: 'SwapJettonFP';
    masterAddress: Address;
    assetIn: bigint;
    minAmountOut: bigint;
    deadline: bigint;
    recipient: Maybe<Address>;
    next: Maybe<Cell>;
    extraPayload: Maybe<Cell>;
    fulfillPayload: Maybe<Cell>;
    rejectPayload: Maybe<Cell>;
};

export type JettonTransferPool = {
    $$type: 'JettonTransfer';
    queryId: bigint;
    jettonAmount: bigint;
    to: Address;
    responseAddress: Maybe<Address>;
    customPayload: Maybe<Cell>;
    forwardTonAmount: bigint;
    forwardPayload: Maybe<AddLiquidityFP | SwapJettonFP>;
};

export const DexRouterOpcode = {
    TopUp: 0xd372158c,
    AddLiquidity: 0x3ebe5431,
    SwapJetton: 0x2d709ea7,
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
        b.storeCoins(value.tonAmount);
        b.storeCoins(value.minLpAmount);
        b.storeAddress(value.masterAddress);
        b.storeAddress(value.recipient);
        b.storeMaybeRef(value.fulfillPayload);
        b.storeMaybeRef(value.rejectPayload);
    };
}

export function storeSwapJettonFP(value: SwapJettonFP) {
    return (b: Builder) => {
        b.storeUint(DexRouterOpcode.SwapJetton, 32);
        b.storeAddress(value.masterAddress);
        b.storeUint(value.assetIn, 1);
        b.storeCoins(value.minAmountOut);
        b.storeUint(value.deadline, 64);
        b.storeAddress(value.recipient);
        b.storeMaybeRef(value.next);
        b.storeMaybeRef(value.extraPayload);
        b.storeMaybeRef(value.fulfillPayload);
        b.storeMaybeRef(value.rejectPayload);
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

    static packSwapJettonFP(src: SwapJettonFP) {
        return beginCell().store(storeSwapJettonFP(src)).endCell();
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
        if (
            src.forwardPayload &&
            typeof src.forwardPayload === 'object' &&
            src.forwardPayload.$$type === 'SwapJettonFP'
        ) {
            c = DexRouter.packSwapJettonFP(src.forwardPayload);
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
