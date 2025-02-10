import { loadFixture, ethers, expect, time } from "./setup";
import type { LowkickStarter } from "../typechain-types";
import { Campaign__factory } from "../typechain-types";

describe("LowkickStarter", function() {
    async function dep() {
        const [ owner, pledger ] = await ethers.getSigners();

        const LowkickStarterFactory = await ethers.getContractFactory("LowkickStarter");
        const lowkick: LowkickStarter = await LowkickStarterFactory.deploy();
        await lowkick.waitForDeployment();

        return { lowkick, owner, pledger }
    }

    async function depAndCampaign() {
        const { lowkick, owner, pledger } = await loadFixture(dep);

        const threeDays = 60 * 60 * 24 * 3;
        const endsAt = Math.floor(Date.now() / 1000) + threeDays; 
        const newCampaign = await lowkick.start(1000, endsAt);
        await newCampaign.wait();
        const campaignAddr = (await lowkick.campaigns(1)).targetContract;

        const campaignAsOwner = Campaign__factory.connect(
        campaignAddr,
        owner
        );
        
        const campaignAsPledger = Campaign__factory.connect(
        campaignAddr,
        pledger
        );

        return { lowkick, campaignAddr, owner, pledger, campaignAsOwner, campaignAsPledger, threeDays }
    }


    describe("Lowkick Create", function() {
        it('allows to create lowkick', async function(){
            const { lowkick, owner } = await loadFixture(dep);
            
            const endsAt = Math.floor(Date.now() / 1000) + 30; // milliseconds to seconds
            const startTx = await lowkick.start(1000, endsAt);
            await startTx.wait();
    
            const campaignAddr = (await lowkick.campaigns(1)).targetContract;
            const campaignAsOwner = Campaign__factory.connect(
            campaignAddr,
            owner
            );

            expect(await campaignAsOwner.endsAt()).to.eq(endsAt);
        })
        
        it('does not allow a duration greater than the maximum', async function () {
            const { lowkick, owner } = await loadFixture(dep);

            const daysInSeconds = 60 * 60 * 24 * 31;
            const endsAt = Math.floor(Date.now() / 1000) + daysInSeconds;
            await expect(lowkick.start(1000, endsAt)).to.be.reverted; 
        })
    })

    describe("Lowkick Interaction", function() {
        it('allows to pledge', async function() {
            const { lowkick, campaignAddr, owner, campaignAsOwner, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            const campaignBalance = await ethers.provider.getBalance(campaignAddr);
            expect(campaignBalance).to.eq(1500);
        });

        it('does not allow owner to claim before campaign end', async function() {
            const { lowkick, campaignAsOwner, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();
    
            await expect(campaignAsOwner.claim()).to.be.reverted;
            expect((await lowkick.campaigns(1)).claimed).to.be.false;
        });

        it('allow owner to claim properly after ending and reaching goal', async function() {
            const { lowkick, owner, campaignAsOwner, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            await time.increase(threeDays);
    
            await expect(() => campaignAsOwner.claim()).
            to.changeEtherBalances([campaignAsOwner, owner], [-1500, 1500]);
        });
        
        it('does not allow owner to claim after ending and when goal not reached', async function() {
            const { lowkick, owner, campaignAsOwner, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 900});
            await pledgeTx.wait();

            await time.increase(threeDays);
    
            await expect(campaignAsOwner.claim()).to.be.reverted;
            expect((await lowkick.campaigns(1)).claimed).to.be.false;
        });

        it('changes status in lowkick after claim', async function() {
            const { lowkick, campaignAsOwner, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            await time.increase(threeDays);
    
            await campaignAsOwner.claim();
            
            expect((await lowkick.campaigns(1)).claimed).to.be.true;    
        });
    })
    
   
});