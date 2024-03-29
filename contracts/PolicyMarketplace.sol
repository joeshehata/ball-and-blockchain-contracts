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
    bytes32 id;
    bytes32 policyId;
    address reviewer;
    uint value;
    uint cost;
    bytes32 details;
    address purchaser;
  }

  mapping (bytes32 => Bid[]) policyBids;
  mapping (bytes32 => mapping(address => uint)) bidderByPolicy;


  mapping (bytes32 => Review[]) policyReviews;
  mapping (bytes32 => mapping(address => uint)) reviewByPolicy;
  mapping (bytes32 => bytes32) reviewById;


  event NewPolicy(address indexed _from, string _message);
  event NewBid(address indexed _from, string _message);
  event CanceledBid(address indexed _from, string _message);
  event Accepted(address indexed _from, string _message);
  event NewReview(address indexed _from, string _message);
  event PurchasedReview(address indexed _from, string _message);

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
    policyIndexMap[_policy.id] = policies.length;
    NewPolicy(msg.sender, "we have a new policy");
  }

  function getPolicies() constant returns (bytes32[] ids, bytes32[] riskType,
        uint[] ratingExpiration,
        uint[] offerExpiration,
        bytes32[] territoryOfIssue,
        uint[] policyFaceAmount,
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
      ids[i] = policies[i].id;
      riskType[i] = policies[i].riskType;
      ratingExpiration[i] = policies[i].ratingExpiration;
      offerExpiration[i] = policies[i].offerExpiration;
      territoryOfIssue[i] = policies[i].territoryOfIssue;
      policyFaceAmount[i] = policies[i].policyFaceAmount;
      /*gender[i] = policies[i].gender;
      dob[i] = policies[i].dob;*/
      disclosures[i] = policies[i].disclosures;
    }
  }

  function bytes32ToString (bytes32 data) returns (string) {
      bytes memory bytesString = new bytes(32);
      for (uint j=0; j<32; j++) {
          byte char = byte(bytes32(uint(data) * 2 ** (8 * j)));
          if (char != 0) {
              bytesString[j] = char;
          }
      }
      return string(bytesString);
  }

  function bid(bytes32 _policyId, uint _value) returns (bool success) {
    if (policyIndexMap[_policyId] > 0 && bidderByPolicy[_policyId][msg.sender] == 0) {
        Bid memory _newBid;
        _newBid.bidder = msg.sender;
        _newBid.value = _value;

        policyBids[_policyId].push(_newBid);

        bidderByPolicy[_policyId][msg.sender] = policyBids[_policyId].length;

        NewBid(msg.sender, bytes32ToString(_policyId));
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
      if (bidderByPolicy[_policyId][targetBidder] > 0) {
        // true if the bid is active out there
          uint id = bidderByPolicy[_policyId][targetBidder] - 1;

          policies[_index].assumingUser = targetBidder;

          policies[_index].ended = true;

          Accepted(msg.sender, "Accepted bid");
      }
    }
  }

  function addReview(bytes32 _policyId, uint _value, uint _cost, bytes32 _details) {
    Review memory _review;

    bytes32 _id = sha3(policies.length + 1);
    _review.id = _id;
    _review.policyId = _policyId;
    _review.reviewer = msg.sender;
    _review.value = _value;
    _review.cost = _cost;
    _review.details = _details;

    // todo: map the review to the policy
    policyReviews[_policyId].push(_review);
    reviewByPolicy[_policyId][msg.sender] = policyReviews[_policyId].length;
    reviewById[_id] = _policyId;
    NewReview(msg.sender, "Received a new review");
  }

  function getReviews(bytes32 _policyId) constant returns(bytes32[] ids, address[] reviewers, uint[] values, uint[] costs, bytes32[] details, address[] purchasers) {
    if (policyReviews[_policyId].length == 0) {
      throw;
    }

    uint length = policyReviews[_policyId].length;
    ids = new bytes32[](length);
    reviewers = new address[](length);
    values = new uint[](length);
    costs = new uint[](length);
    details = new bytes32[](length);
    purchasers = new address[](length);

    for(uint i = 0; i < length; i++) {
      Review _review = policyReviews[_policyId][i];
      ids[i] = _review.id;
      reviewers[i] = _review.reviewer;
      values[i] = _review.value;
      costs[i] = _review.cost;
      details[i] = _review.details;
      purchasers[i] = _review.purchaser;
    }
  }

  function buyReview(bytes32 _reviewId) {
    if (reviewById[_reviewId] == 0) {
      throw;
    }

    bytes32 _policyId = reviewById[_reviewId];

    uint length = policyReviews[_policyId].length;

    for(uint i = 0; i < length; i++) {
      if(_reviewId == policyReviews[_policyId][i].id) {
        policyReviews[_policyId][i].purchaser = msg.sender;
        PurchasedReview(msg.sender, "purchaed review");
        return;
      }
    }

  }
}
