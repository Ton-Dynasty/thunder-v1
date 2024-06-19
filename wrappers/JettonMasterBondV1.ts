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
    ThunderMint: 0x61950add,
    InternalTransfer: 0x178d4519,
    Burn: 0x595f07bc,
    BurnNotification: 0x7bdd97de,
    Excess: 0xd53276db,
    JettonNotification: 0x7362d09c,
    DepositAsset: 0x95db9d39,
    ClaimAdminFee: 0x913e42af,
    ToTheMoon: 0x18ea8228,
    Upgrade: 0x2508d66a,
};

export type Mint = {
    $$type: 'BuyToken';
    queryId: bigint;
    tonAmount: bigint;
    minTokenOut: bigint;
    destination: Address;
    responseAddress: Address;
    custom_payload: Maybe<Cell>;
    forwardTonAmount: bigint;
    forwardPayload: Cell;
};

export function storeMint(src: Mint) {
    return (b: Builder) => {
        b.storeUint(MasterOpocde.ThunderMint, 32);
        b.storeUint(src.queryId, 64);
        b.storeCoins(src.tonAmount);
        b.storeCoins(src.minTokenOut);
        b.storeAddress(src.destination);
        b.storeAddress(src.responseAddress);
        b.storeMaybeRef(src.custom_payload);
        b.storeCoins(src.forwardTonAmount);
        b.storeRef(src.forwardPayload);
    };
}

export type ToTheMoon = {
    $$type: 'ToTheMoon';
    queryId: bigint;
    tonBody: Cell;
    jettonBody: Cell;
    vault1: Address;
};

export function storeToTheMoon(src: ToTheMoon) {
    return (b: Builder) => {
        b.storeUint(MasterOpocde.ToTheMoon, 32);
        b.storeUint(src.queryId, 64);
        b.storeRef(src.tonBody);
        b.storeRef(src.jettonBody);
        b.storeAddress(src.vault1);
    };
}

export type Upgrade = {
    $$type: 'Upgrade';
    queryId: bigint;
    newCode: Cell;
    newData: Maybe<Cell>;
};

export function storeUpgrade(src: Upgrade) {
    return (b: Builder) => {
        b.storeUint(MasterOpocde.Upgrade, 32);
        b.storeUint(src.queryId, 64);
        b.storeRef(src.newCode);
        b.storeMaybeRef(src.newData);
    };
}

export type JettonMasterBondV1Config = {
    totalSupply: bigint;
    adminAddress: Address;
    tonReserves: bigint;
    jettonReserves: bigint;
    fee: bigint;
    onMoon: boolean;
    jettonWalletCode: Cell;
    jettonContent: Cell;
    vTon: bigint;
    tonTheMoon: bigint;
    feeRate: bigint;
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
                .storeBit(config.onMoon)
                .storeRef(config.jettonWalletCode)
                .storeRef(config.jettonContent)
                .endCell(),
        )
        .storeRef(beginCell().storeCoins(config.vTon).storeCoins(config.tonTheMoon).storeUint(config.feeRate, 16))
        .endCell();
}

export class JettonMasterBondV1 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    /* pack data */
    static packBuyToken(src: Mint) {
        return beginCell().store(storeMint(src)).endCell();
    }

    static packToTheMoon(src: ToTheMoon) {
        return beginCell().store(storeToTheMoon(src)).endCell();
    }

    static packUpgrade(src: Upgrade) {
        return beginCell().store(storeUpgrade(src)).endCell();
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        args: { value: bigint; bounce?: boolean },
        body: Mint,
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

    async sendToTheMoon(provider: ContractProvider, via: Sender, value: bigint, body: ToTheMoon) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMasterBondV1.packToTheMoon(body),
        });
    }

    async sendClaimFee(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(MasterOpocde.ClaimAdminFee, 32).storeUint(0, 64).endCell(),
        });
    }

    async sendUpgrade(
        provider: ContractProvider,
        via: Sender,
        args: { value: bigint; bounce?: boolean },
        body: Upgrade,
        sendMode?: SendMode,
    ) {
        await provider.internal(via, {
            value: args.value,
            bounce: args.bounce,
            sendMode: sendMode,
            body: JettonMasterBondV1.packUpgrade(body),
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
        const onMoon = fees.stack.readBoolean();
        const adminAddress = fees.stack.readAddress();
        return {
            tonReserves,
            jettonReserves,
            fee,
            totalSupply,
            onMoon,
            adminAddress,
        };
    }

    async getBuyEstimateResult(provider: ContractProvider, amountIn: bigint) {
        const result = await provider.get('get_estimate_buy_result', [
            {
                type: 'int',
                value: amountIn,
            },
        ]);
        const amountOut = result.stack.readBigNumber();
        const tonReserve = result.stack.readBigNumber();
        const jettonReserve = result.stack.readBigNumber();
        const totalSupply = result.stack.readBigNumber();

        return {
            amountOut,
            tonReserve,
            jettonReserve,
            totalSupply,
        };
    }
    async getSellEstimateResult(provider: ContractProvider, amountIn: bigint) {
        const result = await provider.get('get_estimate_sell_result', [
            {
                type: 'int',
                value: amountIn,
            },
        ]);
        const amountOut = result.stack.readBigNumber();
        const tonReserve = result.stack.readBigNumber();
        const jettonReserve = result.stack.readBigNumber();
        const totalSupply = result.stack.readBigNumber();

        return {
            amountOut,
            tonReserve,
            jettonReserve,
            totalSupply,
        };
    }
}
