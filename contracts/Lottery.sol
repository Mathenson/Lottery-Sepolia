// what we wanna do
//Enter the lottery (paying some amount)
//Pick a random winner(verifiably random)
//Winner will be selected every X minutes ==> completly automated
//chainlink Oracles


//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

//errors
error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeedNotNeeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**
 * @title A sample Lottery Contract
 * @author Mathenson
 * @notice This contract is for creating umtamperable decentralized smart contract
 * @dev This implements chainlink VRF v2 and chainlink Keepers
 */

contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface{

    //Enum State declaration
    enum LotteryState {
        OPEN,
        CALCUATING

    }


            /*State Variables*/
    //we will define an entrance fee for the lottery
    uint256 private immutable i_entranceFee;
    //we define an array of players
    address payable[] private  s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    // this is amount of gas you are willing to pay
    bytes32 private immutable i_gasLane; 
    //the subscriptionID
    uint64 private immutable i_subscriptionId; 

    uint32 private immutable i_callbackGasLimit;
    //how many confirmations the gas should wait before responding, 
    //the more the node wait the more secure the random number is
    uint16 private constant REQUEST_CONFIRMATIONS = 3; 
    //how many radom words we want to request
    uint32 private constant NUM_WORDS = 1;


            /*Events*/
    event lotteryEntered(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner );


            /* Lottery variables*/
    address private s_recentWinner;
    LotteryState private s_lotteryState;
    uint256 private s_lastTimeStamp;
    uint256 private i_interval;

            /* FUNCTIONS */
    constructor(
        uint256 entranceFee, 
        address vrfCoordinatorV2, 
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
        ) VRFConsumerBaseV2(vrfCoordinatorV2){
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        //initialise the raffle state as open
        s_lotteryState = LotteryState.OPEN; 
        s_lastTimeStamp = block.timestamp;
        i_interval =  interval;
    }

    //we wan to be able to enter raffle
    function enterLottery()  public payable{
        if (msg.value < i_entranceFee) {
            revert Lottery__NotEnoughETHEntered();
        }
    //should only allow player to enter if the lottery state is open
        if(s_lotteryState != LotteryState.OPEN) {
            revert Lottery__NotOpen();
        }
        s_players.push(payable(msg.sender)); 
        emit lotteryEntered(msg.sender);


    /**
     * @dev  This is the function that the Chainlink nodes call
     * they look for the `UpKeepNeeded` to be return true
     * The following should be true in order to return true
     * 1. Our time interval should have passed
     * 2. the lottery should have at least 1 player, and have some ETH
     * 3. Our subscription is funded with LINK
     * 4. The lottery should be in an "open" state.
     */

    }

    function checkUpkeep(
        bytes memory /*checkData*/
        ) public view override returns (bool upKeepNeeded, bytes memory /*performData*/)
        {
            //check if the lottery state is open
            bool isOpen = (LotteryState.OPEN == s_lotteryState);
            //check if enough time has passed 
            bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
            //check if we have enough players
            bool hasPlayers = (s_players.length > 0);
            //check if we have enough balance
            bool balanceOf = address(this).balance > 0;
            upKeepNeeded = (isOpen && timePassed && hasPlayers && balanceOf);

        }


    //we shold be able to pick random winner
    function performUpkeep(bytes calldata /*perfomData*/) external override{
        //we request random words
        //once we get it, we do something with it
        // 2 transaction process
        (bool upkeepNeeded, ) = checkUpkeep("");
        if(!upkeepNeeded) {
            revert Lottery__UpkeedNotNeeeded(address(this).balance, s_players.length, uint256 (s_lotteryState) );
        }
        s_lotteryState = LotteryState.CALCUATING;
        uint256 requestId =  i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gas lane
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
         );
         emit RequestedRaffleWinner(requestId);

    }

    function fulfillRandomWords(uint256 /*requestId*/, uint256[] memory randomWords) 
        internal 
        override {
            //using the modulo to get the winner randomly
            uint256 indexOfWinner = randomWords[0] % s_players.length;
            address payable recentWinner = s_players[indexOfWinner];
            s_recentWinner = recentWinner;
            s_lotteryState = LotteryState.OPEN;
            //reset players array
            s_players = new address payable[](0);
            //reset timestamp
            s_lastTimeStamp = block.timestamp;
            (bool success, ) = recentWinner.call{value: address(this).balance}("");
            if(!success){
                revert Lottery__TransferFailed();
            }
            //query the list of winners
            emit WinnerPicked(recentWinner);
             

        }
            /*View / Pure functions */

    //show entrance fee
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    //get players
    function getPlayer(uint256 index) public view returns(address) {
        return s_players[index];
    }

    //get recent winner
    function getRecentWinners() public view returns(address) {
        return s_recentWinner;
    }

    //get raffle state
    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    //get number of random words
    function getNumWords() public pure returns(uint256) {
        return NUM_WORDS;
    }
    
    //get number of players
    function getPlayerNums() public view returns(uint256) {
        return s_players.length;
    }

    //get tmestamp
    function getLatestTimeStamp() public view returns(uint256){
        return s_lastTimeStamp;
    }

    //get blockconformation
    function getRequestConfirmatons() public pure returns(uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    //get the interval
    function getInterval() public  view returns (uint256) {
        return i_interval;
    }
} 