import { loadFixture, ethers, expect, time } from "./setup";
import type { LowkickStarter } from "../typechain-types";
import { Campaign__factory } from "../typechain-types";

describe("LowkickStarter", function() {
    async function dep() {
        const [ owner, pledger, pledger2 ] = await ethers.getSigners();

        const LowkickStarterFactory = await ethers.getContractFactory("LowkickStarter");
        const lowkick: LowkickStarter = await LowkickStarterFactory.deploy();
        await lowkick.waitForDeployment();

        return { lowkick, owner, pledger, pledger2 }
    }

    async function depAndCampaign() {
        const { lowkick, owner, pledger, pledger2 } = await loadFixture(dep);

        const threeDays = 60 * 60 * 24 * 3;
        // divide date.now() by a 1000 to get seconds
        const endsAt = Math.floor(Date.now() / 1000) + threeDays; 
        const newCampaign = await lowkick.start(1000, endsAt);
        await newCampaign.wait();
        // get the contents of the array by campaign number
        const campaignAddr = (await lowkick.campaigns(1)).targetContract;

        // connect to the lowkick as owner
        const campaignAsOwner = Campaign__factory.connect(
        campaignAddr,
        owner
        );
        
        // connect to the lowkick as pledgers
        const campaignAsPledger = Campaign__factory.connect(
        campaignAddr,
        pledger
        );

        const campaignAsPledger2 = Campaign__factory.connect(
        campaignAddr,
        pledger2
        );
    

        return { lowkick, campaignAddr, owner, pledger, pledger2, campaignAsOwner, campaignAsPledger, campaignAsPledger2,  threeDays }
    }


    describe("Lowkick Create", function() {
        it('allows to create lowkick', async function(){
            const { lowkick, owner } = await loadFixture(dep);
            
            // divide date.now() by a 1000 to get seconds
            const endsAt = Math.floor(Date.now() / 1000) + 30; 
            const startTx = await lowkick.start(1000, endsAt);
            await startTx.wait();
            const campaignAddr = (await lowkick.campaigns(1)).targetContract;
            
            const campaignAsOwner = Campaign__factory.connect(
            campaignAddr,
            owner
            );

            expect(await campaignAsOwner.endsAt()).to.eq(endsAt);
        })

        it('allows to create more than one lowkick', async function(){
            const { lowkick, owner } = await loadFixture(dep);
            
            // create the first lowkick
            const endsAt1 = Math.floor(Date.now() / 1000) + 50; 
            const startTx1 = await lowkick.start(1000, endsAt1);
            await startTx1.wait();

            // create the second lowkick
            const endsAt2 = Math.floor(Date.now() / 1000) + 40; 
            const startTx2 = await lowkick.start(1000, endsAt2);
            await startTx2.wait();

            // get the second lowkick address
            const campaignAddr = (await lowkick.campaigns(2)).targetContract;
            
            // connect to the second lowkick
            const campaignAsOwner = Campaign__factory.connect(
            campaignAddr,
            owner
            );

            expect(await campaignAsOwner.endsAt()).to.eq(endsAt2);
        })
        
        it('does not allow a duration greater than the maximum', async function () {
            const { lowkick } = await loadFixture(dep);

            const daysInSeconds = 60 * 60 * 24 * 31;
            const endsAt = Math.floor(Date.now() / 1000) + daysInSeconds;
            await expect(lowkick.start(1000, endsAt)).to.be.reverted; 
        })

        it('does not allow a zero goal', async function () {
            const { lowkick } = await loadFixture(dep);

            const endsAt = Math.floor(Date.now() / 1000) + 30;
            await expect(lowkick.start(0, endsAt)).to.be.reverted; 
        })
    });

    describe("Lowkick interaction as pledger", function() {
        it('allows to pledge', async function() {
            const { campaignAddr, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            const campaignBalance = await ethers.provider.getBalance(campaignAddr);
            expect(campaignBalance).to.eq(1500);
        });

        it('allows to pledge multiple times', async function() {
            const { campaignAddr, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();
            const secondPledgeTx = await campaignAsPledger.pledge({value: 1500});
            await secondPledgeTx.wait();

            const campaignBalance = await ethers.provider.getBalance(campaignAddr);
            expect(campaignBalance).to.eq(3000);
        });

        it('allow pledger to refund full pledge before campaign end', async function() {
            const {  pledger, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();
            
            await expect(() => campaignAsPledger.refundPledge(1500)).
            to.changeEtherBalances([campaignAsPledger, pledger], [-1500, 1500])
        });

        it('allow pledger to refund part of pledge before campaign end', async function() {
            const {  pledger, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();
            
            await expect(() => campaignAsPledger.refundPledge(1000)).
            to.changeEtherBalances([campaignAsPledger, pledger], [-1000, 1000])
        });

        it('does not allow pledger to refund pledge after campaign end', async function() {
            const { campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            await time.increase(threeDays);
            
            await expect(campaignAsPledger.refundPledge(1500)).to.be.reverted;
        });

        it('allow pledger to use fullRefund() after campaign end if goal not reached', async function() {
            const {  pledger, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  

            const pledgeTx = await campaignAsPledger.pledge({value: 900});
            await pledgeTx.wait();

            await time.increase(threeDays);

            await expect(() => campaignAsPledger.fullRefund()).
            to.changeEtherBalances([campaignAsPledger, pledger], [-900, 900]);
        });

        it('does not allow pledger to use fullRefund() after campaign end if goal reached', async function() {
            const { campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  

            const pledgeTx = await campaignAsPledger.pledge({value: 1900});
            await pledgeTx.wait();

            await time.increase(threeDays);

            await expect(campaignAsPledger.fullRefund()).to.be.reverted;
        });
        
        it('allow several pledgers to pledge', async function() {
            const { pledger2, campaignAsPledger, campaignAsPledger2 } = await loadFixture(depAndCampaign);

            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait()

            await expect(() => campaignAsPledger2.pledge({value: 1200})).
            to.changeEtherBalances([campaignAsPledger2, pledger2], [1200, -1200])
        });

        it('allow several pledgers to refund properly before campaign end', async function(){
            const { pledger, pledger2, campaignAsPledger, campaignAsPledger2 } = await loadFixture(depAndCampaign);

            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait()
            const pledgeTx2 = await campaignAsPledger2.pledge({value: 1200});
            await pledgeTx2.wait()

            await expect(() => campaignAsPledger.refundPledge(1300)).
            to.changeEtherBalances([campaignAsPledger, pledger], [-1300, 1300]);
            await expect(() => campaignAsPledger2.refundPledge(1200)).
            to.changeEtherBalances([campaignAsPledger2, pledger2], [-1200, 1200]);
        });

        it('does not allow pledger to refund more than it pledged', async function() {
            const { pledger, pledger2, campaignAsPledger, campaignAsPledger2 } = await loadFixture(depAndCampaign);

            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait()
            const pledgeTx2 = await campaignAsPledger2.pledge({value: 1200});
            await pledgeTx2.wait()

            await expect(campaignAsPledger2.refundPledge(1600)).to.be.reverted;
        });
    });

    describe("Lowkick interaction as owner", function() {
        it('does not allow owner to claim before campaign end', async function() {
            const { lowkick, campaignAsOwner, campaignAsPledger } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();
    
            await expect(campaignAsOwner.claim()).to.be.reverted;
            expect((await lowkick.campaigns(1)).claimed).to.be.false;
        });

        it('allow owner to claim properly after ending and reaching goal', async function() {
            const {  owner, campaignAsOwner, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
            const pledgeTx = await campaignAsPledger.pledge({value: 1500});
            await pledgeTx.wait();

            await time.increase(threeDays);
    
            await expect(() => campaignAsOwner.claim()).
            to.changeEtherBalances([campaignAsOwner, owner], [-1500, 1500]);
        });
        
        it('does not allow owner to claim after ending when goal not reached', async function() {
            const { lowkick, campaignAsOwner, campaignAsPledger, threeDays } = await loadFixture(depAndCampaign);  
        
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
    });
    
   
});