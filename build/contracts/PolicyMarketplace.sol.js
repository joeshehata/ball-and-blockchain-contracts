var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("PolicyMarketplace error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("PolicyMarketplace error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("PolicyMarketplace contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of PolicyMarketplace: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to PolicyMarketplace.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: PolicyMarketplace not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "_policyId",
            "type": "bytes32"
          },
          {
            "name": "targetBidder",
            "type": "address"
          }
        ],
        "name": "accept",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_policyId",
            "type": "bytes32"
          },
          {
            "name": "_value",
            "type": "uint256"
          },
          {
            "name": "_cost",
            "type": "uint256"
          },
          {
            "name": "_details",
            "type": "bytes32"
          }
        ],
        "name": "reviewPolicy",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_riskType",
            "type": "bytes32"
          },
          {
            "name": "_ratingExpiration",
            "type": "uint256"
          },
          {
            "name": "_offerExpiration",
            "type": "uint256"
          },
          {
            "name": "_territoryOfIssue",
            "type": "bytes32"
          },
          {
            "name": "_policyFaceAmount",
            "type": "uint256"
          },
          {
            "name": "_gender",
            "type": "bytes32"
          },
          {
            "name": "_dob",
            "type": "uint256"
          },
          {
            "name": "_disclosures",
            "type": "bytes32"
          }
        ],
        "name": "addPolicy",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_policyId",
            "type": "bytes32"
          }
        ],
        "name": "getBids",
        "outputs": [
          {
            "name": "bidders",
            "type": "address[]"
          },
          {
            "name": "values",
            "type": "uint256[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_policyId",
            "type": "bytes32"
          },
          {
            "name": "_value",
            "type": "uint256"
          }
        ],
        "name": "bid",
        "outputs": [
          {
            "name": "success",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "policies",
        "outputs": [
          {
            "name": "id",
            "type": "bytes32"
          },
          {
            "name": "cedingUser",
            "type": "address"
          },
          {
            "name": "assumingUser",
            "type": "address"
          },
          {
            "name": "riskType",
            "type": "bytes32"
          },
          {
            "name": "ratingExpiration",
            "type": "uint256"
          },
          {
            "name": "offerExpiration",
            "type": "uint256"
          },
          {
            "name": "territoryOfIssue",
            "type": "bytes32"
          },
          {
            "name": "policyFaceAmount",
            "type": "uint256"
          },
          {
            "name": "gender",
            "type": "bytes32"
          },
          {
            "name": "dob",
            "type": "uint256"
          },
          {
            "name": "disclosures",
            "type": "bytes32"
          },
          {
            "name": "ended",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "NewBid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "CanceledBid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "Accepted",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6060604052610a36806100126000396000f3606060405236156100565760e060020a600035046333146b7d811461005857806344e3716d146100ec5780635165c583146101325780639d4f988b146102af578063cd772f5c14610313578063d3e89483146103e7575b005b610056600435602435600082815260036020526040812054600280548392839287926000199290920191849190839081101561000257509052600c81027f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ad98101547f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace919091019060ff161561057057610002565b6040805160c081018252600060a0820152600435815233600160a060020a0316602082015260243591810191909152604435606082015260643560809190910152610056565b604080516101808101825260008082526020828101828152838501839052606084018381526080850184815260a0860185815260c0870186815260e0880187815261010089018881526101208a018981526101408b018a81526101608c019a909a52600280548d51600182018082529e5190819003909b01909a20808d5233600160a060020a0316909952600435978890526024359687905260443595869052606435948590526084359384905260a4359283905260c4359182905260e4359a8b90528c81556100569c979b969a9599949893979296919594919392909190828183801582901161076e57600c0281600c02836000526020600020918201910161076e91905b80821115610843576000808255600182018054600160a060020a0319908116909155600283018054909116905560038201819055600482018190556005820181905560068201819055600782018190556008820181905560098201819055600a820155600b8101805460ff19169055600c01610238565b6040805160208181018352600080835283518083018552818152845180840186528281528551808501875283815286518088018852848152808601859052600435808652958590529684205461046c97959695939493849182141561084757610002565b6104f1600435602435604080518082018252600080825260208281018290528582526003905291822054829011801561036c5750600084815260016020908152604080832033600160a060020a03168452909152812054145b156109665733600160a060020a0316815260208181018490526000858152908190526040902080546001810180835582818380158290116109725760020281600202836000526020600020918201910161097291905b80821115610843578054600160a060020a0319168155600060018201556002016103c2565b6105056004356002805482908110156100025790600052602060002090600c020160005080546001820154600283015460038401546004850154600586015460068701546007880154600889015460098a0154600a8b0154600b9b909b0154999b50600160a060020a039889169a979098169895979496939592949193909260ff168c565b6040518080602001806020018381038352858181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050018381038252848181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500194505050505060405180910390f35b604080519115158252519081900360200190f35b604080519c8d52600160a060020a039b8c1660208e015299909a168b8a015260608b019790975260808a019590955260a089019390935260c088019190915260e087015261010086015261012085015261014084015290151561016083015251908190036101800190f35b600088815260036020526040902054600280546000199290920197509087908110156100025750600052600c86027f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5acf8101547f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace919091019550600160a060020a03908116339091161415610764576000888152600160209081526040808320600160a060020a038b1684529091528120541115610764576001600160005060008a600019168152602001908152602001600020600050600089600160a060020a0316815260200190815260200160002060005054039350866002600050878154811015610002576000829052600c81027f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ad0018054600160a060020a0319169093179092558054600192508890811015610002575050600c8781027f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ad901805460ff19169092179091556040805160208082528101929092527f4163636570746564206269640000000000000000000000000000000000000000828201525133600160a060020a0316917f5fcded2d97af8206f1a0128b391cd0a2dac0be0ed194f98738fc2945572745aa919081900360600190a25b5050505050505050565b505050919090600052602060002090600c020160005083518155602084810151600183018054600160a060020a03199081169092179055600283810180546040898101519190941617905560608701516003858101919091556080880151600486015560a0880151600586015560c0880151600686015560e0880151600786015561010088015160088601556101208801516009860155610140880151600a860155610160880151600b95909501805460ff191690951790945554600086815293909252909120555050505050505050505050565b5090565b6000888152602081905260409081902054905190955085908059106108695750595b908082528060200260200182016040528015610880575b509350846040518059106108915750595b9080825280602002602001820160405280156108a8575b509250600091505b8482101561095957600088815260208190526040902080548390811015610002579060005260206000209060020201600050604080518082019091528154600160a060020a03168082526001929092015460208201528551909250859084908110156100025790602001906020020190600160a060020a0316908181526020015050806020015183838151811015610002575050602083810285010152600191909101906108b0565b5091969095509350505050565b600091505b5092915050565b50505060009283525060208083208451600293909302018054600160a060020a03191690921782558381015160019283015586835282815260408084205492825280842033600160a060020a0316808652908352938190209290925581518181526012918101919091527f52656365697665642061206e65772062696400000000000000000000000000008183015290517fab2a69a9e618f496a4567fbd5914d821c4b60d6d16e676594be69edb178da0fd9181900360600190a26001915061096b56",
    "events": {
      "0xab2a69a9e618f496a4567fbd5914d821c4b60d6d16e676594be69edb178da0fd": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "NewBid",
        "type": "event"
      },
      "0xc3169a79e06507900996af8bceee77751a5c274ac62ccafb7394c3ba5597aa40": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "CanceledBid",
        "type": "event"
      },
      "0x5fcded2d97af8206f1a0128b391cd0a2dac0be0ed194f98738fc2945572745aa": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_message",
            "type": "string"
          }
        ],
        "name": "Accepted",
        "type": "event"
      }
    },
    "updated_at": 1473489674571,
    "links": {},
    "address": "0x217e16f0d739ec61539bd6f8506df31254c54026"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "PolicyMarketplace";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.PolicyMarketplace = Contract;
  }
})();
