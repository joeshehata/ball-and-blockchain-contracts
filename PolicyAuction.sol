//pragma solidity ^0.4.1;

contract PolicyAuction {

    struct Policy {
      address assumer;
      bytes32 disclosures;
    }

    Policy policy;

    address cedingEntity;
    uint auctionEndTime;  // todo: implement

    address bidder;
    struct Bid {
      address bidder;
      uint value;
    }
    mapping (address => uint) bidderId;
    Bid[] bids;

    // Set to true at the end, disallows any change
    bool public ended = false;

    event NewBid(address indexed _from, string _message);
    event CanceledBid(address indexed _from, string _message);
    event Accepted(address indexed _from, string _message);

    function PolicyAuction() {
        cedingEntity = msg.sender;
    }

    modifier openOnly() {
      if(policy.disclosures == 0) {
        throw;
      }
      if(ended) {
        throw;
      }
      _
    }

    function createPolicy(bytes32 _disclosures) {
      policy.disclosures = _disclosures;
    }

    function getPolicy(bytes32 _disclosures) returns (bytes32 disclosures) {
      return policy.disclosures;
    }

    function bid(uint _value) openOnly {
      Bid memory _newBid;
      _newBid.bidder = msg.sender;
      _newBid.value = _value;

      bids.push(_newBid);
      bidderId[_newBid.bidder] = bids.length;

      NewBid(msg.sender, "Received a new bid");
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
      if(msg.sender == cedingEntity) {
        if (bidderId[targetBidder] > 0) {
            uint id = bidderId[targetBidder] - 1;
            Bid _bid = bids[id];

            policy.assumer = targetBidder;

            ended = true;

            Accepted(msg.sender, "Accepted bid");
        }
      }
    }
}
