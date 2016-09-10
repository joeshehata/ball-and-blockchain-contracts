//pragma solidity ^0.4.1;

contract Policy {
  address public cedingUser;
  address public assumingUser;

  bytes32 public riskType;
  uint public ratingExpiration;
  uint public offerExpiration;
  bytes32 public territoryOfIssue;
  uint public policyFaceAmount;
  bytes32 public gender;
  uint public dob;
  bytes32 public disclosures;


  uint public auctionEndTime;  // todo: implement

  // todo: put bids here
  struct Bid {
    address bidder;
    uint value;
  }
  mapping (address => uint) bidderId;
  Bid[] bids;

  bool public ended = false;

  event NewBid(address indexed _from, string _message);
  event CanceledBid(address indexed _from, string _message);
  event Accepted(address indexed _from, string _message);

  function Policy(address _cedingUser, bytes32 _disclosures) {
      cedingUser = _cedingUser;
      disclosures = _disclosures;
  }

  modifier openOnly() {
    if(ended) {
      throw;
    }
    _
  }

  modifier notCedingEntity() {
    if(msg.sender == cedingUser) {
      throw;
    }
    _
  }

  function bid(address bidder, uint _value) openOnly notCedingEntity {
    Bid memory _newBid;
    _newBid.bidder = bidder;
    _newBid.value = _value;

    bids.push(_newBid);
    bidderId[_newBid.bidder] = bids.length;

    NewBid(bidder, "Received a new bid");
  }

  function cancelBid() {
    if (bidderId[msg.sender] > 0) {
        uint id = bidderId[msg.sender] - 1;
        Bid _bid = bids[id];

        _bid.bidder = 0x0;
        _bid.value = 0;
        bidderId[msg.sender] = 0;
        CanceledBid(msg.sender, "Canceled bid");
    }
  }

  function getBids() constant returns (address[] bidder, uint[] value) {
    uint length = bids.length;
    address[] memory _bidders = new address[](length);
    uint[] memory _values = new uint[](length);

    for(uint i = 0; i < length; i++) {
      Bid memory _bid = bids[i];
      _bidders[i] = _bid.bidder;
      _values[i] = _bid.value;
    }

    return (_bidders, _values);
  }

  function accept(address targetBidder) openOnly {
    /*if(msg.sender == cedingUser) {
      if (bidderId[targetBidder] > 0) {
          uint id = bidderId[targetBidder] - 1;
          Bid _bid = bids[id];

          policy.assumer = targetBidder;

          ended = true;

          Accepted(msg.sender, "Accepted bid");
      }
    }*/
  }

}

contract PolicyMarketplace {

    address[] policies;
    mapping (address => uint) policyIndexMap;

    function addPolicy(bytes32 _disclosures, uint _test) {
      address policyAddress = new Policy(msg.sender, _disclosures);

      policies.push(policyAddress);
      policyIndexMap[policyAddress] = policies.length;
    }

    function getPolicies() constant returns (bytes32[]) {
      /*uint length = policies.length;
      address[] memory _policies = new address[](length);

      for(uint i = 0; i < length; i++) {
        _policies[i] = policies[i];
      }

      return _policies; // todo: return all the fields from the policy*/

      uint length = 10;//policies.length;
      bytes32[] memory _policies = new bytes32[](length);

      for(uint i = 0; i < length; i++) {
        _policies[i] = "asdf";
      }

      return _policies; // todo: return all the fields from the policy
    }

    function getPolicy(uint _index) constant returns (address policy) {
      return policies[_index];  // todo: replace with address of targetPolicy
    }

    function bid(address targetPolicy, uint value) returns (bool success) {
      if (policyIndexMap[targetPolicy] > 0) {
          uint id = policyIndexMap[targetPolicy] - 1;
          Policy(targetPolicy).bid(msg.sender, value);
          return true;
      }
      return false;
    }

    /*function getPolicy(bytes32 _disclosures) returns (bytes32 disclosures) {
      return policy.disclosures;
    }*/

    /*function bid(address targetPolicy, uint _value) {
      //


      Bid memory _newBid;
      _newBid.bidder = msg.sender;
      _newBid.value = _value;

      bids.push(_newBid);
      bidderId[_newBid.bidder] = bids.length;

      NewBid(msg.sender, "Received a new bid");
    }

    function getBids() constant returns (address[] bidder, uint[] value) {
      uint length = bids.length;
      address[] memory _bidders = new address[](length);
      uint[] memory _values = new uint[](length);

      for(uint i = 0; i < length; i++) {
        Bid memory _bid = bids[i];
        _bidders[i] = _bid.bidder;
        _values[i] = _bid.value;
      }

      return (_bidders, _values);
    }*/

    // todo: add get policies
}
