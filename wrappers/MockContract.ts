import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MockContractConfig = {
    jettonMasterAddress: Address;
    jettonWalletAddress: Address;
};

export function mockContractConfigToCell(config: MockContractConfig): Cell {
    return beginCell().storeAddress(config.jettonMasterAddress).storeAddress(config.jettonWalletAddress).endCell();
}

export class MockContract implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new MockContract(address);
    }

    static createFromConfig(config: MockContractConfig, code: Cell, workchain = 0) {
        const data = mockContractConfigToCell(config);
        const init = { code, data };
        return new MockContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xd372158c, 32).storeUint(0, 64).endCell(),
        });
    }

    async getWalletAddress(provider: ContractProvider): Promise<Address> {
        const walletAddress = await provider.get('get_wallet_address', []);
        return walletAddress.stack.readAddress();
    }
}
