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
        "name": "addReview",
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
            "name": "targetBidder",
            "type": "address"
          }
        ],
        "name": "accept",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getPolicies",
        "outputs": [
          {
            "name": "ids",
            "type": "bytes32[]"
          },
          {
            "name": "riskType",
            "type": "bytes32[]"
          },
          {
            "name": "ratingExpiration",
            "type": "uint256[]"
          },
          {
            "name": "offerExpiration",
            "type": "uint256[]"
          },
          {
            "name": "territoryOfIssue",
            "type": "bytes32[]"
          },
          {
            "name": "policyFaceAmount",
            "type": "uint256[]"
          },
          {
            "name": "disclosures",
            "type": "bytes32[]"
          }
        ],
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
        "constant": true,
        "inputs": [
          {
            "name": "_policyId",
            "type": "bytes32"
          }
        ],
        "name": "getReviews",
        "outputs": [
          {
            "name": "ids",
            "type": "bytes32[]"
          },
          {
            "name": "reviewers",
            "type": "address[]"
          },
          {
            "name": "values",
            "type": "uint256[]"
          },
          {
            "name": "costs",
            "type": "uint256[]"
          },
          {
            "name": "details",
            "type": "bytes32[]"
          },
          {
            "name": "purchasers",
            "type": "address[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_reviewId",
            "type": "bytes32"
          }
        ],
        "name": "buyReview",
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
        "name": "NewReview",
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
        "name": "PurchasedReview",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6060604052611715806100126000396000f3606060405236156100775760e060020a600035046302034a84811461007957806333146b7d146101895780633b04f6f11461021d5780635165c583146105e05780639d4f988b1461075d578063a005293b146107c1578063c46215531461082f578063cd772f5c14610854578063d3e8948314610928575b005b6100776004356024356044356064356040805160e08101825260008082526020828101828152838501838152606085018481526080860185815260a0870186815260c088018790528851600554600190810182528a51918290038801909120808a52958e905233600160a060020a0316909452918b905289905287905289845260029092529390912080549182018082559293929091908281838015829011610dce57600702816007028360005260206000209182019101610dce91905b80821115610ee757600080825560018201819055600282018054600160a060020a0319908116909155600383018290556004830182905560058301919091556006820180549091169055600701610137565b610077600435602435600082815260066020526040812054600580548392839287926000199290920191849190839081101561000257509052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3dbb8101547f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db0919091019060ff1615610eeb57610002565b6109ad60408051602081810183526000808352835180830185528181528451808401865282815285518085018752838152865180860188528481528751808701895285815288519687018952858752975160055497989497939692959194939190829080591061028a5750595b9080825280602002602001820160405280156102a1575b5098508850816040518059106102b45750595b9080825280602002602001820160405280156102cb575b5097508750816040518059106102de5750595b9080825280602002602001820160405280156102f5575b5096508650816040518059106103085750595b90808252806020026020018201604052801561031f575b5095508550816040518059106103325750595b908082528060200260200182016040528015610349575b50945084508160405180591061035c5750595b908082528060200260200182016040528015610373575b5093508350816040518059106103865750595b90808252806020026020018201604052801561039d575b509250600090505b818110156110e9576005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db0015489518a90839081101561000257602090810290910101526005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db30154885189908390811015610002576020908102909101015260058054829081101561000257506000528651600c82027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db40154908890839081101561000257602090810290910101526005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db5015486518790839081101561000257602090810290910101526005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db6015485518690839081101561000257602090810290910101526005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db7015484518590839081101561000257602090810290910101526005805482908110156100025750600052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3dba01548351849083908110156100025750506020828102850101526001016103a5565b604080516101808101825260008082526020828101828152838501839052606084018381526080850184815260a0860185815260c0870186815260e0880187815261010089018881526101208a018981526101408b018a81526101608c019a909a52600580548d51600182018082529e5190819003909b01909a20808d5233600160a060020a0316909952600435978890526024359687905260443595869052606435948590526084359384905260a4359283905260c4359182905260e4359a8b90528c81556100779c979b969a959994989397929691959491939290919082818380158290116110f457600c0281600c0283600052602060002091820191016110f491905b80821115610ee7576000808255600182018054600160a060020a0319908116909155600283018054909116905560038201819055600482018190556005820181905560068201819055600782018190556008820181905560098201819055600a820155600b8101805460ff19169055600c016106e6565b60408051602081810183526000808352835180830185528181528451808401865282815285518085018752838152865180880188528481528086018590526004358086529585905296842054610b599795969593949384918214156111cc57610002565b610bde60043560408051602081810183526000808352835180830185528181528451808401865282815285518085018752838152865180860188528481528751808701895285815289865260029096529684205495969295919490939091819081908114156112eb57610002565b6100776004356000818152600460205260408120548190819081141561152c57610002565b610d4f60043560243560408051808201825260008082526020828101829052858252600690529182205482901180156108ad5750600084815260016020908152604080832033600160a060020a03168452909152812054145b156116455733600160a060020a0316815260208181018490526000858152908190526040902080546001810180835582818380158290116116515760020281600202836000526020600020918201910161165191905b80821115610ee7578054600160a060020a031916815560006001820155600201610903565b610d636004356005805482908110156100025790600052602060002090600c020160005080546001820154600283015460038401546004850154600586015460068701546007880154600889015460098a0154600a8b0154600b9b909b0154999b50600160a060020a039889169a979098169895979496939592949193909260ff168c565b604051808060200180602001806020018060200180602001806020018060200188810388528f8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500188810387528e8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500188810386528d8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500188810385528c8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500188810384528b8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500188810383528a8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050018881038252898181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019e50505050505050505050505050505060405180910390f35b6040518080602001806020018381038352858181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050018381038252848181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500194505050505060405180910390f35b6040518080602001806020018060200180602001806020018060200187810387528d8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500187810386528c8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500187810385528b8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f15090500187810384528a8181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050018781038352898181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050018781038252888181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019c5050505050505050505050505060405180910390f35b604080519115158252519081900360200190f35b604080519c8d52600160a060020a039b8c1660208e015299909a168b8a015260608b019790975260808a019590955260a089019390935260c088019190915260e087015261010086015261012085015261014084015290151561016083015251908190036101800190f35b505050600092835250602080832085516007939093020191825584810151600183015560408581015160028481018054600160a060020a0319908116909317905560608881015160038781019190915560808a015160048881019190915560a08b0151600589015560c08b015160069890980180549095169097179093558c87529084528286205491845282862033600160a060020a031680885290855283872092909255868652938352938190208a905580518281526015928101929092527f52656365697665642061206e657720726576696577000000000000000000000082820152517fffc800fc6475474b400325e33c1c5cc4708527aeb50ce42d6bb6958c07d85167929181900390910190a2505050505050565b5090565b600088815260066020526040902054600580546000199290920197509087908110156100025750600052600c86027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db18101547f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db0919091019550600160a060020a039081163390911614156110df576000888152600160209081526040808320600160a060020a038b16845290915281205411156110df576001600160005060008a600019168152602001908152602001600020600050600089600160a060020a0316815260200190815260200160002060005054039350866005600050878154811015610002576000829052600c81027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db2018054600160a060020a0319169093179092558054600192508890811015610002575050600c8781027f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3dbb01805460ff19169092179091556040805160208082528101929092527f4163636570746564206269640000000000000000000000000000000000000000828201525133600160a060020a0316917f5fcded2d97af8206f1a0128b391cd0a2dac0be0ed194f98738fc2945572745aa919081900360600190a25b5050505050505050565b505090919293949596565b505050919090600052602060002090600c02016000508351808255602085810151600184018054600160a060020a0319908116909217905560028401805460408981015191909316179055606087015160038501556080870151600485015560a087015160058581019190915560c088015160068681019190915560e0890151600787015561010089015160088701556101208901516009870155610140890151600a870155610160890151600b96909601805460ff1916909617909555546000938452939091529020555050505050505050505050565b6000888152602081905260409081902054905190955085908059106111ee5750595b908082528060200260200182016040528015611205575b509350846040518059106112165750595b90808252806020026020018201604052801561122d575b509250600091505b848210156112de57600088815260208190526040902080548390811015610002579060005260206000209060020201600050604080518082019091528154600160a060020a03168082526001929092015460208201528551909250859084908110156100025790602001906020020190600160a060020a031690818152602001505080602001518383815181101561000257505060208381028501015260019190910190611235565b5091969095509350505050565b60008a81526002602052604090819020549051909350839080591061130d5750595b908082528060200260200182016040528015611324575b5098508850826040518059106113375750595b90808252806020026020018201604052801561134e575b5097508750826040518059106113615750595b908082528060200260200182016040528015611378575b50965086508260405180591061138b5750595b9080825280602002602001820160405280156113a2575b5095508550826040518059106113b55750595b9080825280602002602001820160405280156113cc575b5094508450826040518059106113df5750595b9080825280602002602001820160405280156113f6575b509350600091505b828210156115205760008a8152600260205260409020805483908110156100025790600052602060002090600702016000509050806000016000505489838151811015610002576020818102909201909101919091525060028101548851600160a060020a03919091169089908490811015610002576020818102909201909101919091525060038101548751889084908110156100025760208181029092019091019190915250600481015486518790849081101561000257602081810290920190910191909152506005810154855186908490811015610002576020818102909201909101919091525060068101548451600160a060020a03919091169085908490811015610002575050602083810286010152600191909101906113fe565b50505091939550919395565b505050600081815260046020908152604080832054808452600290925282205490915b81811015611637576000838152600260205260409020805482908110156100025790600052602060002090600702016000505484141561163d576000838152600260205260409020805433919083908110156100025790600052602060002090600702016000506006018054600160a060020a0319169091179055604080516020808252600f908201527f707572636861656420726576696577000000000000000000000000000000000081830152905133600160a060020a0316917f0ad5fb7f0d3061261c0a717334e08fa792c2a3dabab5308a17bd4c6709a2c958919081900360600190a25b50505050565b60010161154f565b600091505b5092915050565b50505060009283525060208083208451600293909302018054600160a060020a03191690921782558381015160019283015586835282815260408084205492825280842033600160a060020a0316808652908352938190209290925581518181526012918101919091527f52656365697665642061206e65772062696400000000000000000000000000008183015290517fab2a69a9e618f496a4567fbd5914d821c4b60d6d16e676594be69edb178da0fd9181900360600190a26001915061164a56",
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
      },
      "0xffc800fc6475474b400325e33c1c5cc4708527aeb50ce42d6bb6958c07d85167": {
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
        "name": "NewReview",
        "type": "event"
      },
      "0x0ad5fb7f0d3061261c0a717334e08fa792c2a3dabab5308a17bd4c6709a2c958": {
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
        "name": "PurchasedReview",
        "type": "event"
      }
    },
    "updated_at": 1473515985422,
    "links": {},
    "address": "0x3b62caf50831cb163d853dd7f3943f1fb8aa2f0e"
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
