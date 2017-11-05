const chai = require('chai');
global.expect = chai.expect;

//require('./sorted_set_test');
require('./consistent_map_test');
//
require('./cluster_node_test');
//
require('./elio_integration_test');
require('./elio_routing_test');