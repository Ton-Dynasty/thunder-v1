import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type FarmV1Config = {};

export function farmV1ConfigToCell(config: FarmV1Config): Cell {
    return beginCell().endCell();
}

export class FarmV1 implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new FarmV1(address);
    }

    static createFromConfig(config: FarmV1Config, code: Cell, workchain = 0) {
        const data = farmV1ConfigToCell(config);
        const init = { code, data };
        return new FarmV1(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
