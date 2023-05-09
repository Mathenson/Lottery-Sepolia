//running the uint test on the develoment chain
const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
//const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat.config") 

!developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Lottery Uint Tests", async function () {
        let lottery, lotteryContract, vrfCoordinatorV2Mock, deployer, interval
        const chainId = network.config.chainId

        beforeEach(async function () {

            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            lottery = await ethers.getContract("Lottery", deployer)
            lotteryContract = await ethers.getContract("Lottery")
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            lotteryEntranceFee = await lottery.getEntranceFee()
            interval = await lottery.getInterval()
            accounts = await ethers.getSigners()
        })
                //THIS BLOCK IS FOR THE CONSTRUCTOR
        describe("constructor", async function () {
            it("initialize the lottery constructor correctly", async function () {

                const lotteryState = await lottery.getLotteryState()
                const interval = await lottery.getInterval()
                assert.equal(lotteryState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId]["interval"])
            })
            
        })
                //THIS BLOCK IS FOR THE ENTER LOTTERY FUNCTION
        //testing for the enter raffle
        describe("enterLottery", async function () {
            //it revert error if enough eth is not inputed
            it("revert with a custom error Not enough ETH", async function () {
                await expect(lottery.enterLottery()).to.be.revertedWith(
                    "Lottery__NotEnoughETHEntered"
                )
            })
            //it records player when the enter 
            it("it records the player as they enter", async function () {
                  await lottery.enterLottery({value: lotteryEntranceFee })
                  //make sure the deployer is recorded in the contract
                  const playerFromContract = await lottery.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
            })

            //it emit an events when entered  
            it("it emit an evet when entered", async function () {
                await expect(lottery.enterLottery({value: lotteryEntranceFee})).to.emit(lottery,
                    "lotteryEntered"
                    )
            })
            //it doesnt allow players to enter when calculating
            //here we front run the block by using time travel to increatse
            //the block.timestamp so as to allow the lottery state to be in a
            //calculating state, which will reject entry from players
            it("reject entry during calculating period", async function (){
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                //pretend to be a Chainlink keeper
                await lottery.performUpkeep([])
                await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith(
                    "Lottery__NotOpen"
                    )
             })

        })
                //THIS BLOCK IS FOR THE CHECKUPKEEP FUNCTION
        describe("checkUpKeep", async function () {
            it("returns false if people hasn't sent enough ETH", async function (){
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded} = await lottery.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            //it return false if the raffle state is not open
            it("return false if the raffle isnt open", async function () {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({method: "evm_mine", params:[] })
                await lottery.performUpkeep([])
                const lotteryState = await lottery.getLotteryState()
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert.equal(lotteryState.toString(), "1")
                assert.equal(upkeepNeeded, false)
            })
            //when the time hasn't passed
            it("return false if enough time hasnt passed", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.request({method: "evm_mine", params: []})
                const { upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert(!upkeepNeeded)
            })
           
            //when the time has passed
            it("return true if enough time has passed, has players, eth, and is open", async function () {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.request({method: "evm_mine", params: []})
                const { upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert(!upkeepNeeded)
            })
        })
                //THIS BLOCK IS FOR THE PERFORM UPKEEP
        describe("performUpkeep", function () {
            it("it can only run if checkupkeep is true", async function () {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await lottery.performUpkeep([])
                assert(tx)
            })
            it("revert if checkupkeep is false", async function () {
                await expect(lottery.performUpkeep([])).to.be.revertedWith(
                    "Lottery__UpkeedNotNeeeded"
                )
            })
            it("updates the raffle state, emits and event, and calls the vrf coordinator", async function () {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                //increase block.timestamp
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                //mine the block 
                await network.provider.send("evm_mine", [])
                const txResponse = await lottery.performUpkeep([])
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.events[1].args.requestId
                const lotteryState = await lottery.getLotteryState()
                assert(requestId.toNumber() > 0)
                assert(lotteryState.toNumber() == "1")
            })
        })

                //THIS BLOCK IS FOR FULFILL RANDOMWORDS
        describe("fulfillrandomwords", async function () {
            beforeEach(async function () {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })
            it("can only be called after performUpkeep", async function () {
                 await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
                    ).to.be.revertedWith("nonexistent request")
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
                ).to.be.revertedWith("nonexistent request")
            })
            it("picks a winner, reset the lottery, and send money", async function () {
                const additionalEntrances = 3 // to test
                const startingIndex = 2
                for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) { // i = 2; i < 5; i=i+1
                    lottery = lotteryContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                    await lottery.enterLottery({ value: lotteryEntranceFee })
                } //{
                    // const accountConnectLottery = lottery.connect(accounts[i])
                    // await accountConnectLottery.enterLottery({ value: lotteryEntranceFee }) 
               // }
                const startingTimeStamp = await lottery.getLatestTimeStamp()

                //performUpkeep (mock being chainlink keepers)
                //fulfillRandomwords (mock being the chainlink VRF)
                //we will have to wait for the fullfilrandomword to be called
                await new Promise(async (resolve, reject ) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("Found the event")
                        try {
                            console.log(recentWinner)
                            console.log(account[2])
                            console.log(account[0])
                            console.log(account[1])
                            console.log(account[3])
                            const recentWinner = await lottery.getWinnner()
                            const lotteryState = await lottery.getLotteryState()
                            const endingTimeStamp = await lottery.getLatestTimeStamp()
                            const numPlayers = await lottery.getNumberOfPlayers()
                            assert.equal(numPlayers.toString(), "0")
                            assert.equal(lotteryState.toString(), "0")
                            assert(endingTimeStamp > startingTimeStamp)
                        } catch (e) {
                            reject(e)
                        }
                        resolve()
                    })
                    //seeting up a listener
                    //we will fire an even, and the listener will pick it up and resolve
                    const tx = await lottery.performUpkeep([1])
                    const txReceipt = await tx.wait(1)
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        lottery.address
                    )
                   
                })

            })
        })
    })