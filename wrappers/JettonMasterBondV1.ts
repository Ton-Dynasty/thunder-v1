import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type JettonMasterBondV1Config = {};

export function jettonMasterBondV1ConfigToCell(config: JettonMasterBondV1Config): Cell {
    return beginCell().endCell();
}

export class JettonMasterBondV1 implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

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
            body: beginCell().endCell(),
        });
    }
}
