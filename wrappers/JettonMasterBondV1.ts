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
    Slice,
} from '@ton/core';
import { Maybe } from '@ton/core/dist/utils/maybe';

export const MasterOpocde = {
    TopUp: 0xd372158c,
    Mint: 0x642b7d07,
    InternalTransfer: 0x178d4519,
    Burn: 0x595f07bc,
    BurnNotification: 0x7bdd97de,
    Excess: 0xd53276db,
    JettonNotification: 0x7362d09c,
    DepositAsset: 0x95db9d39,
    ClaimAdminFee: 0x913e42af,
    ToTheMoon: 0x18ea8228,
};

export type BuyToken = {
    $$type: 'BuyToken';
    query_id: bigint;
    ton_amount: bigint;
    minTokenOut: bigint;
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
        b.storeCoins(src.minTokenOut);
        b.storeAddress(src.destination);
        b.storeAddress(src.response_address);
        b.storeMaybeRef(src.custom_payload);
        b.storeCoins(src.forward_ton_amount);
        b.storeRef(src.forward_payload);
    };
}

export type TonTheMoon = {
    $$type: 'TonTheMoon';
    query_id: bigint;
    ton_body: Cell;
    jetton_body: Cell;
    vault_1: Address;
};

export function storeTonTheMoon(src: TonTheMoon) {
    return (b: Builder) => {
        b.storeUint(MasterOpocde.ToTheMoon, 32);
        b.storeUint(src.query_id, 64);
        b.storeRef(src.ton_body);
        b.storeRef(src.jetton_body);
        b.storeAddress(src.vault_1);
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
                .storeInt(config.onMoon, 2)
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

    static packTonTheMoon(src: TonTheMoon) {
        return beginCell().store(storeTonTheMoon(src)).endCell();
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

    async sendToTheMoon(provider: ContractProvider, via: Sender, value: bigint, body: TonTheMoon) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMasterBondV1.packTonTheMoon(body),
        });
    }

    async sendClaimFee(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(MasterOpocde.ClaimAdminFee, 32).storeUint(0, 64).endCell(),
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

    async getJettonData(provider: ContractProvider) {
        const res = await provider.get('get_jetton_data', []);
        const totalSupply = res.stack.readBigNumber();
        const mintable = res.stack.readBoolean();
        const adminAddress = res.stack.readAddress();
        const content = res.stack.readCell();
        const walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getMasterData(provider: ContractProvider) {
        const fees = await provider.get('get_master_data', []);
        const tonReserves = fees.stack.readBigNumber();
        const jettonReserves = fees.stack.readBigNumber();
        const fee = fees.stack.readBigNumber();
        const totalSupply = fees.stack.readBigNumber();
        const onMoon = fees.stack.readBigNumber();
        const dexRouter = fees.stack.readAddress();
        const adminAddress = fees.stack.readAddress();
        return {
            tonReserves,
            jettonReserves,
            fee,
            totalSupply,
            onMoon,
            dexRouter,
            adminAddress,
        };
    }
}
