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

export const MasterOpocde = {
    TopUp: 0xd372158c,
    Mint: 0x642b7d07,
    InternalTransfer: 0x178d4519,
    Burn: 0x595f07bc,
    BurnNotification: 0x7bdd97de,
};

export type BuyToken = {
    $$type: 'BuyToken';
    query_id: bigint;
    ton_amount: bigint;
    mint_token_out: bigint;
    destination: Address;
    response_address: Address;
    custom_payload: Maybe<Cell>;
    forward_ton_amount: bigint;
    forward_payload: Cell;
};

export function storeBuyToken(src: BuyToken) {
    return (b: Builder) => {
        b.storeUint(MasterOpocde.Mint, 32);
        b.storeUint(src.query_id, 64);
        b.storeCoins(src.ton_amount);
        b.storeCoins(src.mint_token_out);
        b.storeAddress(src.destination);
        b.storeAddress(src.response_address);
        b.storeMaybeRef(src.custom_payload);
        b.storeCoins(src.forward_ton_amount);
        b.storeRef(src.forward_payload);
    };
}

export type JettonMasterBondV1Config = {
    totalSupply: bigint;
    adminAddress: Address;
    tonReserves: bigint;
    jettonReserves: bigint;
    fee: bigint;
    onMoon: bigint;
    dexRouter: Address;
    jettonWalletCode: Cell;
    jettonContent: Cell;
};

export function jettonMasterBondV1ConfigToCell(config: JettonMasterBondV1Config): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeAddress(config.adminAddress)
        .storeCoins(config.tonReserves)
        .storeCoins(config.jettonReserves)
        .storeCoins(config.fee)
        .storeRef(
            beginCell()
                .storeUint(config.onMoon, 2)
                .storeAddress(config.dexRouter)
                .storeRef(config.jettonWalletCode)
                .storeRef(config.jettonContent)
                .endCell(),
        )
        .endCell();
}

export class JettonMasterBondV1 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    /* pack data */
    static packBuyToken(src: BuyToken) {
        return beginCell().store(storeBuyToken(src)).endCell();
    }

    async sendBuyToken(
        provider: ContractProvider,
        via: Sender,
        args: { value: bigint; bounce?: boolean },
        body: BuyToken,
        sendMode?: SendMode,
    ) {
        await provider.internal(via, {
            value: args.value,
            bounce: args.bounce,
            sendMode: sendMode,
            body: JettonMasterBondV1.packBuyToken(body),
        });
    }

    static createFromAddress(address: Address) {
        return new JettonMasterBondV1(address);
    }

    static createFromConfig(config: JettonMasterBondV1Config, code: Cell, workchain = 0) {
        const data = jettonMasterBondV1ConfigToCell(config);
        const init = { code, data };
        return new JettonMasterBondV1(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(MasterOpocde.TopUp, 32).storeUint(0, 64).endCell(),
        });
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const walletAddress = await provider.get('get_wallet_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(owner).endCell(),
            },
        ]);
        return walletAddress.stack.readAddress();
    }

    async getReserves(provider: ContractProvider): Promise<[bigint, bigint]> {
        const walletAddress = await provider.get('get_reserves', []);
        const tonReserves = walletAddress.stack.readBigNumber();
        const jettonReserves = walletAddress.stack.readBigNumber();
        return [tonReserves, jettonReserves];
    }

    async getFees(provider: ContractProvider): Promise<bigint> {
        const fees = await provider.get('get_fee', []);
        return fees.stack.readBigNumber();
    }
}
