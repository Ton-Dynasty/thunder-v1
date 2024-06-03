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
};

export type Deposit = {
    $$type: 'Deposit';
    queryId: bigint;
    asset0Amount: bigint;
    asset1Amount: bigint;
    minLpAmount: bigint;
    lpReceiver: Maybe<Address>;
    fulfillPayload: Maybe<Cell>;
    rejectPayload: Maybe<Cell>;
};

export function storeDeposit(src: Deposit) {
    return (b: Builder) => {
        b.storeUint(PoolOpcodes.Deposit, 32);
        b.storeUint(src.queryId, 64);
        b.storeCoins(src.asset0Amount);
        b.storeCoins(src.asset1Amount);
        b.storeCoins(src.minLpAmount);
        b.storeAddress(src.lpReceiver);
        b.storeMaybeRef(src.fulfillPayload);
        b.storeMaybeRef(src.rejectPayload);
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
    static packDeposit(src: Deposit) {
        return beginCell().store(storeDeposit(src)).endCell();
    }

    /* Send */
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(PoolOpcodes.TopUp, 32).storeUint(0, 64).endCell(),
        });
    }

    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        args: { value: bigint; bounce?: boolean },
        body: Deposit,
        sendMode?: SendMode,
    ) {
        await provider.internal(via, {
            value: args.value,
            bounce: args.bounce,
            sendMode: sendMode,
            body: PoolV1.packDeposit(body),
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
}
