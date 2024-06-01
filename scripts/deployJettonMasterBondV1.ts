import { Address, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { compile, NetworkProvider } from '@ton/blueprint';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonWallet } from '@ton/ton';
import { PoolV1 } from '../wrappers/PoolV1';

export async function run(provider: NetworkProvider) {
    const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
    const jettonWalletCode = await compile(JettonWallet.name);
    const dexRouterAddress = Address.parse('kQCWSVUZqiyS-Wnx4MD-QCdLuj1AFxE99xml2gHscDxjdzCo');

    const jettonMasterBondV1 = provider.open(
        JettonMasterBondV1.createFromConfig(
            {
                totalSupply: toNano('100000000'),
                adminAddress: provider.sender().address!,
                tonReserves: 0n,
                jettonReserves: toNano('100000000'),
                fee: 0n,
                onMoon: 0n,
                dexRouter: dexRouterAddress,
                jettonWalletCode: jettonWalletCode,
                jettonContent: beginCell().endCell(),
            },
            jettonMasterBondV1Code,
        ),
    );

    await jettonMasterBondV1.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonMasterBondV1.address);

    // run methods on `jettonMasterBondV1`
}
