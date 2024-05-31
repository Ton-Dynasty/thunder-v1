import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

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
export const MasterOpocde = {
    TopUp: 0xd372158c,
};
export class JettonMasterBondV1 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

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
}
