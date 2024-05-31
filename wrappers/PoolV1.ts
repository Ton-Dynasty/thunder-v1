import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type PoolV1Config = {};

export function poolV1ConfigToCell(config: PoolV1Config): Cell {
    return beginCell().endCell();
}

export class PoolV1 implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new PoolV1(address);
    }

    static createFromConfig(config: PoolV1Config, code: Cell, workchain = 0) {
        const data = poolV1ConfigToCell(config);
        const init = { code, data };
        return new PoolV1(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
