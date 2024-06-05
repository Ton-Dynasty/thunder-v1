import { toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';
import { PoolV1 } from '../wrappers/PoolV1';
import { LpJettonWallet } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const dexRouterCode = await compile(DexRouter.name);
    const jettonWalletCode = await compile(LpJettonWallet.name);
    const poolCode = await compile(PoolV1.name);

    const dexRouter = provider.open(
        DexRouter.createFromConfig(
            {
                ownerAddress: provider.sender().address!,
                poolCode: poolCode,
                lpWalletCode: jettonWalletCode,
            },
            dexRouterCode,
        ),
    );

    await dexRouter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(dexRouter.address);

    // run methods on `dexRouter`
}
