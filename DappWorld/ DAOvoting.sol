// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

contract DAO {
    address owner;

    uint256 contributionTimeEnd;
    uint256 voteTime;
    uint256 quorum;
    
    uint256 sharesAmount;

    struct Proposal {
        string description;
        uint amount; 
        address recipient;
        uint voteEnds;
    }

    Proposal[] proposals;
    mapping(uint => mapping(address => uint)) votes;

    mapping(address => uint) shares;
    address[] investors;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    
    function initializeDAO (
        uint256 _contributionTimeEnd,
        uint256 _voteTime,
        uint256 _quorum
    ) public onlyOwner {
        require(_contributionTimeEnd > 0 && _voteTime > 0 && _quorum > 0);

        contributionTimeEnd = block.timestamp + _contributionTimeEnd;
        voteTime = _voteTime;
        quorum = _quorum;
    }


    function contribution() public payable {
        require(block.timestamp <= contributionTimeEnd);
        require(msg.value > 0);

        shares[msg.sender] += msg.value;  
        sharesAmount += msg.value;    
        investors.push(msg.sender);  
    }

    function reedemShare(uint256 amount) public{
        require(shares[msg.sender] >= amount);
        require(sharesAmount >= amount);

        shares[msg.sender] -= amount;
        //(bool success,) = payable(msg.sender).call{value: amount}("");
        //require(success);
        payable(msg.sender).transfer(amount);
    }

    function transferShare(uint256 amount, address to) public {

        require(shares[msg.sender] >= amount);
        require(sharesAmount >= amount);

        shares[msg.sender] -= amount;
        shares[to] += amount;
    }

    function createProposal(string calldata _description,uint256 _amount, address payable _receipient) public onlyOwner {
        
        require(sharesAmount >= _amount);

        Proposal memory proposal = Proposal (
            _description,
            _amount,
            _receipient,
            block.timestamp + voteTime
        );
        
        proposals.push(proposal);
    }

    function voteProposal(uint256 proposalId) public {
        require(block.timestamp <= proposals[proposalId].voteEnds);
        require(shares[msg.sender] > 0);
        require(votes[proposalId][msg.sender] == 0);

        uint256 toVote = shares[msg.sender];

        Proposal storage proposal = proposals[proposalId];
        proposal.amount += toVote;
        votes[proposalId][msg.sender] = toVote;
    }

    function executeProposal(uint256 proposalId) public onlyOwner {
        require(block.timestamp > proposals[proposalId].voteEnds);
        require(sharesAmount > 0);

        Proposal memory proposal = proposals[proposalId];
        uint amount = proposal.amount;
        address recipient = proposal.recipient;

        uint votesPercent = (amount * 100) / sharesAmount;
        if(votesPercent >= 0) {
            (bool success,) = recipient.call{value: amount}("");
            require(success);
        }
    }

    function proposalList() public view returns (string[] memory, uint[] memory, address[] memory) {
        uint proposalsAmount = proposals.length;
        require(proposalsAmount > 0);

        string[] memory descriptions;
        uint[] memory amounts;
        address[] memory addresses;

        for(uint i = 0; i < proposalsAmount; i++) {
            Proposal memory proposal = proposals[i];
            descriptions[i] = proposal.description;
            amounts[i] = proposal.amount;
            addresses[i] = proposal.recipient;
        }

        return (descriptions, amounts, addresses);
    }

    function allInvestorList() public view returns (address[] memory) {
        require(investors.length > 0);
        return investors;
    }
}