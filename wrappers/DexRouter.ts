import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type DexRouterConfig = {
    ownerAddress: Address;
    poolCode: Cell;
    lpWalletCode: Cell;
};

export const DexRouterOpcode = {
    TopUp: 0xd372158c,
};

export function dexRouterConfigToCell(config: DexRouterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeRef(config.poolCode)
        .storeRef(config.lpWalletCode)
        .endCell();
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

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(DexRouterOpcode.TopUp, 32).storeUint(0, 64).endCell(),
        });
    }
}
