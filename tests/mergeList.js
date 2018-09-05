var mergeList = require('../src/mergeList.js');

var list ={
  'small': {
    'orig': [{
        'id': 1,
        'name': 'first',
        'data': '1234567890'
      },
      {
        'id': 1,
        'name': 'second',
        'data': '2234567890'
      },
      {
        'id': 1,
        'name': 'third',
        'data': '3234567890'
      },
      {
        'id': 2,
        'name': 'first',
        'data': 'a234567890'
      },
      {
        'id': 2,
        'name': 'second',
        'data': 'b234567890'
      },
      {
        'id': 5,
        'name': 'third',
        'data': 'x234567890'
      },
      {
        'id': 5,
        'name': 'forth',
        'data': 'y234567890'
      }
    ],
    'expected': [{
        'id': 1,
        'first': '1234567890',
        'second': '2234567890',
        'third': '3234567890'
      },
      {
        'id': 2,
        'first': 'a234567890',
        'second': 'b234567890'
      },
      {
        'id': 5,
        'third': 'x234567890',
        'forth': 'y234567890'
      }
    ]
  }
};

module.exports = [{
  'name': 'smallList',
  'description': 'Try out a small list',
  'task': mergeList,
  'params': [list.small.orig, 'id', 'name', 'data', null],
  'operator': 'structureEqual',
  'expected': list.small.expected
}];
