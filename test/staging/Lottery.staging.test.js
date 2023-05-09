const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
//const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat.config") 

!developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Lottery Uint Tests", async function () {
        let lottery, vrfCoordinatorV2Mock, deployer, interval
        const chainId = network.config.chainId

        beforeEach(async function () {

            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            lottery = await ethers.getContract("Lottery", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            lotteryEntranceFee = await lottery.getEntranceFee()
            interval = await lottery.getInterval()
        })
        
    }  )