//pragma solidity ^0.4.1;
contract PolicyMarketplace {

  struct Bid {
    address bidder;
    uint value;
  }

  struct Policy {
    bytes32 id;
    address cedingUser;
    address assumingUser;

    bytes32 riskType;
    uint ratingExpiration;
    uint offerExpiration;
    bytes32 territoryOfIssue;
    uint policyFaceAmount;
    bytes32 gender;
    uint dob;
    bytes32 disclosures;

    bool ended;
  }

  struct Review {
    bytes32 policyId;
    address reviewer;
    uint value;
    uint cost;
    bytes32 details;
    address purchaser;
  }

  mapping (bytes32 => Bid[]) policyBids;
  mapping (bytes32 => mapping(address => uint)) bidderdByPolicy;


  event NewBid(address indexed _from, string _message);
  event CanceledBid(address indexed _from, string _message);
  event Accepted(address indexed _from, string _message);

  modifier openOnly(bytes32 _policyId) {
    uint _index = policyIndexMap[_policyId] - 1;
    Policy _policy = policies[_index];

    if(_policy.ended) {
      throw;
    }
    _
  }

  modifier notCedingEntity(Policy policy) {
    if(msg.sender == policy.cedingUser) {
      throw;
    }
    _
  }

  // marketplace variables
  Policy[] public policies;
  mapping (bytes32 => uint) policyIndexMap; // todo: use a sha function to hash them

  function addPolicy(bytes32 _riskType,
        uint _ratingExpiration,
        uint _offerExpiration,
        bytes32 _territoryOfIssue,
        uint _policyFaceAmount,
        bytes32 _gender,
        uint _dob,
        bytes32 _disclosures) {
    Policy memory _policy;
    bytes32 _id = sha3(policies.length + 1);
    _policy.id = _id;
    _policy.cedingUser = msg.sender;
    _policy.riskType = _riskType;
    _policy.ratingExpiration = _ratingExpiration;
    _policy.offerExpiration = _offerExpiration;
    _policy.territoryOfIssue = _territoryOfIssue;
    _policy.policyFaceAmount = _policyFaceAmount;
    _policy.gender = _gender;
    _policy.dob = _dob;
    _policy.disclosures = _disclosures;

    policies.push(_policy);
    policyIndexMap[_id] = policies.length;
  }

  /*function getPolicies() constant returns (bytes32[] ids, bytes32[] riskType,
        uint[] ratingExpiration,
        uint[] offerExpiration,
        bytes32[] territoryOfIssue,
        uint[] policyFaceAmount,
        bytes32[] gender,
        uint[] dob,
        bytes32[] disclosures) {
    uint length = policies.length;
    ids = new bytes32[](length);
    riskType = new bytes32[](length);
    ratingExpiration = new uint[](length);
    offerExpiration = new uint[](length);
    territoryOfIssue = new bytes32[](length);
    policyFaceAmount = new uint[](length);
    disclosures = new bytes32[](length);

    for(uint i = 0; i < length; i++) {
      //Policy memory _policy = policies[i];
      ids[i] = policies[i].id;
      riskType[i] = policies[i].riskType;
      ratingExpiration[i] = policies[i].ratingExpiration;
      offerExpiration[i] = policies[i].offerExpiration;
      territoryOfIssue[i] = policies[i].territoryOfIssue;
      policyFaceAmount[i] = policies[i].policyFaceAmount;
      gender[i] = policies[i].gender;
      dob[i] = policies[i].dob;
      disclosures[i] = policies[i].disclosures;
    }
  }*/

  function bid(bytes32 _policyId, uint _value) returns (bool success) {
    if (policyIndexMap[_policyId] > 0 && bidderdByPolicy[_policyId][msg.sender] == 0) {
        Bid memory _newBid;
        _newBid.bidder = msg.sender;
        _newBid.value = _value;

        policyBids[_policyId].push(_newBid);

        bidderdByPolicy[_policyId][msg.sender] = policyBids[_policyId].length;

        NewBid(msg.sender, "Received a new bid");
        return true;
    }
    return false;
  }

  function getBids(bytes32 _policyId) constant returns (address[] bidders, uint[] values) {
    if (policyBids[_policyId].length == 0) {
      throw;
    }

    uint length = policyBids[_policyId].length;
    address[] memory _bidders = new address[](length);
    uint[] memory _values = new uint[](length);

    for(uint i = 0; i < length; i++) {
      Bid memory _bid = policyBids[_policyId][i];
      _bidders[i] = _bid.bidder;
      _values[i] = _bid.value;
    }

    return (_bidders, _values);

  }

    /*function cancelBid() {
      if (bidderId[msg.sender] > 0) {
          uint id = bidderId[msg.sender] - 1;
          Ints.Bid _bid = bids[id];

          _bid.bidder = 0x0;
          _bid.value = 0;
          bidderId[msg.sender] = 0;
          CanceledBid(msg.sender, "Canceled bid");
      }
    }

  */

  function accept(bytes32 _policyId, address targetBidder) openOnly(_policyId) {
    uint _index = policyIndexMap[_policyId] - 1;
    Policy policy = policies[_index];
    if(msg.sender == policy.cedingUser) {
      if (bidderdByPolicy[_policyId][targetBidder] > 0) {
        // true if the bid is active out there
          uint id = bidderdByPolicy[_policyId][targetBidder] - 1;

          policies[_index].assumingUser = targetBidder;

          policies[_index].ended = true;

          Accepted(msg.sender, "Accepted bid");
      }
    }
  }

  function reviewPolicy(bytes32 _policyId, uint _value, uint _cost, bytes32 _details) {
    Review memory _review;

    _review.policyId = _policyId;
    _review.reviewer = msg.sender;
    _review.value = _value;
    _review.cost = _cost;
    _review.details = _details;

    // todo: map the review to the policy
  }

  /*function buyReview(bytes32 _policyId, uint _value, uint _cost, bytes32 _details) {
  }*/

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
