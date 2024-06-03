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
import { SwapTon } from './DexRouter';

export type PoolV1Config = {
    adminAddress: Address;
    dexRouter: Address;
    asset0: Address;
    asset1: Address;
    reserve0: bigint;
    reserve1: bigint;
    lpTotalSupply: bigint;
    adminFee: bigint;
    swapFee: bigint;
    lpJettonWalletCode: Cell;
    lpJettonContent: Cell;
};

export function poolV1ConfigToCell(config: PoolV1Config): Cell {
    let initData = beginCell()
        .storeAddress(config.dexRouter)
        .storeAddress(config.asset0)
        .storeAddress(config.asset1)
        .endCell();

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeCoins(config.reserve0)
        .storeCoins(config.reserve1)
        .storeCoins(config.lpTotalSupply)
        .storeCoins(config.adminFee)
        .storeCoins(config.swapFee)
        .storeRef(initData)
        .storeRef(config.lpJettonWalletCode)
        .storeRef(config.lpJettonContent)
        .endCell();
}

export const PoolOpcodes = {
    TopUp: 0xd372158c,
    Deposit: 0x95db9d39,
    InternalTransfer: 0x178d4519,
    Excess: 0xd53276db,
    JettonNotification: 0x7362d09c,
    Transfer: 0xf8a7ea5,
    SwapInternal: 0xfcb1be1e,
    PayoutFromPool: 0x23a14fb2,
    SwapTon: 0xdcb17fc0,
    Withdraw: 0xb5de5f9e,
};

export type WithdrawFP = {
    $$type: 'WithdrawFP';
    asset0MinAmount: bigint;
    asset1MinAmount: bigint;
    recipient: Maybe<Address>;
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
    forwardPayload: Maybe<WithdrawFP>;
};

/* Store */
export function storeWithdrawFP(value: WithdrawFP) {
    return (b: Builder) => {
        b.storeUint(PoolOpcodes.Withdraw, 32);
        b.storeCoins(value.asset0MinAmount);
        b.storeCoins(value.asset1MinAmount);
        b.storeAddress(value.recipient);
        b.storeMaybeRef(value.fulfillPayload);
        b.storeMaybeRef(value.rejectPayload);
    };
}

export class PoolV1 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new PoolV1(address);
    }

    static createFromConfig(config: PoolV1Config, code: Cell, workchain = 0) {
        const data = poolV1ConfigToCell(config);
        const init = { code, data };
        return new PoolV1(contractAddress(workchain, init), init);
    }

    /* Pack */
    static packWithdrawFP(value: WithdrawFP) {
        return beginCell().store(storeWithdrawFP(value)).endCell();
    }

    static packJettonTransfer(src: JettonTransferPool) {
        let c = null;

        if (
            src.forwardPayload &&
            typeof src.forwardPayload === 'object' &&
            src.forwardPayload.$$type === 'WithdrawFP'
        ) {
            c = PoolV1.packWithdrawFP(src.forwardPayload);
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
            body: beginCell().storeUint(PoolOpcodes.TopUp, 32).storeUint(0, 64).endCell(),
        });
    }

    /* Get */
    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const walletAddress = await provider.get('get_wallet_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(owner).endCell(),
            },
        ]);
        return walletAddress.stack.readAddress();
    }

    async getPoolData(provider: ContractProvider) {
        // get_pool_data
        const res = await provider.get('get_pool_data', []);
        const reserve0 = res.stack.readBigNumber();

        const reserve1 = res.stack.readBigNumber();

        const totalSupply = res.stack.readBigNumber();
        return {
            reserve0,
            reserve1,
            totalSupply,
        };
    }
}
