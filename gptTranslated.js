const MY_NAME = 'chooosen'

const COLORS_MAPPING = {
  'Locomotive': 0,
  'Blue': 3,
  'Black': 6,
  'Red': 7,
  'Orange': 5,
  'Yellow': 4,
  'Green': 8,
  'White': 2,
  'Pink': 1,
}
const NUMBER_TO_COLORS_MAPPING ={
  0: 'Locomotive',
  3: 'Blue',
  6: 'Black',
  7: 'Red',
  5: 'Orange',
  4: 'Yellow',
  8: 'Green',
  2: 'White',
  1: 'Pink',
}

var classes = {};

classes.BasePacket = class {
  constructor(hash) {
    this.packetData = hash;
  }

  packetType() {
    return this.packetData.packet_type;
  }

  moveId() {
    return this.packetData.move_id;
  }

  global() {
    return this.packetData.channel.includes('table');
  }

  me() {
    return !this.global() || this.player() === MY_NAME;
  }

  player() {
    return this.data().args.player_name;
  }

  table_id() {
    return this.packetData.table_id
  }

  data() {
    if (this.packetData.data.length > 1) {
      throw new Error(`we do not handle multiple data in packet: ${this.packetData}`);
    }
    return this.packetData.data[0];
  }
}

// class ClaimedRoute extends BasePacket {
classes.ClaimedRoute = class extends classes.BasePacket {
  call(state) {
    const { number: routeLength, colors: colors_a } = this.data().args;
    const locomotives = colors_a.filter(color => color === COLORS_MAPPING.Locomotive)?.length || 0;
    const colorNumber = colors_a.find(color => color !== COLORS_MAPPING.Locomotive) || COLORS_MAPPING.Locomotive;
    const color = NUMBER_TO_COLORS_MAPPING[colorNumber];

    if (this.me()) {
      return state.myCardUse({ color, length: routeLength, locomotives });
    } else {
      return state.enemyCardUse({ color, length: routeLength, locomotives });
    }
  }
}

// class TrainCarPicked extends BasePacket {
classes.TrainCarPicked = class extends classes.BasePacket {
  call(state) {
    const { color, count, colors: colors_a } = this.data().args;
    // const colors_a = this.data().args.colors;

    if (this.me()) {
      if (color !== undefined) {
        return state.myTakeCard(NUMBER_TO_COLORS_MAPPING[color]);
      } else {
        if (colors_a.length === 2) {
          state.myTakeCard(NUMBER_TO_COLORS_MAPPING[colors_a[1]]);
        }
        return state.myTakeCard(NUMBER_TO_COLORS_MAPPING[colors_a[0]]);
      }
    } else {
      if (color !== undefined) {
        return state.enemyTakeCard(NUMBER_TO_COLORS_MAPPING[color]);
      } else {
        if (count === 2) {
          state.enemyTakeCard();
        }
        return state.enemyTakeCard();
      }
    }
  }
}

// class SimpleNote extends BasePacket {
classes.SimpleNote = class extends classes.BasePacket {
  call() {
    console.log(this.data().log);
  }
}

// class DestinationsPicked extends BasePacket {
classes.DestinationsPicked = class extends classes.BasePacket {
  call() {
    console.log(this.data().log);
  }
}

class State {
  constructor(visibleCards, startSetup, { myLeftTrains, enemyLeftTrains }) {
    this.visibleCards = visibleCards;
    this.myCards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(color => [color, 0]));
    this.myUsedCards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(color => [color, 0]));
    this.enemyUsedCards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(color => [color, 0]));
    this.enemyCards = { ...Object.fromEntries(Object.keys(COLORS_MAPPING).map(color => [color, 0])), 'Unknown': 4 };
    Object.entries(startSetup).forEach(([color, number]) => this.myCards[color] = number);
    this.enemyLeftTrains = enemyLeftTrains;
    this.myLeftTrains = myLeftTrains;
  }

  enemyTakeCard(color = 'Unknown') {
    this.enemyCards[color]++;
  }

  myTakeCard(color) {
    this.myCards[color]++;
  }

  myCardUse({ color, length, locomotives = 0 }) {
    const colorLength = length - locomotives;
    this.myUsedCards[color] += colorLength;
    this.myCards[color] -= colorLength;
    this.myUsedCards.Locomotive += locomotives;
    this.myCards.Locomotive -= locomotives;
  }

  enemyCardUse({ color, length, locomotives = 0 }) {
    const colorLength = length - locomotives;
    this.enemyUsedCards[color] += colorLength;
    this.enemyUsedCards.Locomotive += locomotives;

    const color_card_known = Math.min(this.enemyCards[color], colorLength);
    const locomotives_known = Math.min(this.enemyCards.Locomotive, locomotives);

    this.enemyCards[color] -= color_card_known;
    this.enemyCards.Locomotive -= locomotives_known;
    this.enemyCards.Unknown -= length - color_card_known - locomotives_known;
  }

  outputCurrentState() {
    console.log(this);
    // console.log(`Enemy Cards in hand: ${Object.values(this.enemyCards).reduce((acc, val) => acc + val, 0)}`);
    // console.log(`Verify: Enemy Cards used: ${enemy_used_cards.values.sum}`)
  }

  checkValid() {
    console.log(`Enemy Cards used: ${Object.values(this.enemyUsedCards).reduce((acc, val) => acc + val, 0)}`);
    console.log(`My Cards in hand: ${Object.values(this.myCards).reduce((acc, val) => acc + val, 0)}`);
    console.log(`My Cards used: ${Object.values(this.myUsedCards).reduce((acc, val) => acc + val, 0)}`);
    const valid_card_trains_and_used_cards =
      45 * 2 - (this.myLeftTrains + this.enemyLeftTrains) === Object.values(this.myUsedCards).reduce((acc, val) => acc + val, 0) +
        Object.values(this.enemyUsedCards).reduce((acc, val) => acc + val, 0)
    if (valid_card_trains_and_used_cards) console.log('All Valid, based on number of trains and log');
  }

  // #jump
  export_to_excel() {
    return Object.keys(COLORS_MAPPING).map(color =>
      [
        this.myUsedCards[color] + this.enemyUsedCards[color],
        this.myCards[color],
        this.enemyCards[color],
        this.visibleCards[color],
      ].join("\t")
    ).join("\n")
  }
}

const PacketFactory = {
  create: (hash) => {
    switch (true) {
      case hash.data.length > 2:
        throw new Error(`We do not support multiple data in packet ${JSON.stringify(hash)}`);
      case hash.data.length === 1 && hash.data[0].type != undefined:
        const moveType = hash.data[0].type;
        const ClassName = `${moveType[0].toUpperCase()}${moveType.slice(1)}`;
        return new classes[ClassName](hash); // window[ClassName] ?
      case hash.data.length === 1 && hash.data[0].type === undefined:
        throw new Error(`Missing move type ${JSON.stringify(hash)}`);
      case hash.data.length === 0:
        throw new Error(`Missing move object data ${JSON.stringify(hash)}`);
      case Array.isArray(hash.data):
        throw new Error(`data in packet should be array ${JSON.stringify(hash)}`);
      default:
        throw new Error(`Missing data in packet ${JSON.stringify(hash)}`);
    }
  }
};

input = {
  "status": 1,
  "data": {
      "valid": 1,
      "data": [
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "3",
              "packet_type": "history",
              "move_id": "1",
              "time": "1713239048",
              "data": [
                  {
                      "uid": "661df407ee1b8",
                      "type": "simpleNote",
                      "log": "Color of ${players} has been chosen according to his/her preferences. ${change_preferences}",
                      "args": {
                          "players": "<b><span style=\"color:#41a62a\">Claudia81</span></b>",
                          "change_preferences": {
                              "log": "<a href=\"https://boardgamearena.com/preferences\" target=\"_blank\">${label}</a>",
                              "args": {
                                  "i18n": [
                                      "label"
                                  ],
                                  "label": "Change my preferences."
                              }
                          }
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "4",
              "packet_type": "history",
              "move_id": "2",
              "time": "1713240880",
              "data": [
                  {
                      "uid": "661dfb302fe7c",
                      "type": "destinationsPicked",
                      "log": "${player_name} keeps ${count} destinations",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "509162"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "5",
              "packet_type": "history",
              "move_id": "3",
              "time": "1713256314",
              "data": [
                  {
                      "uid": "661e377a8cd02",
                      "type": "destinationsPicked",
                      "log": "${player_name} keeps ${count} destinations",
                      "args": {
                          "player_name": "chooosen",
                          "count": 3
                      },
                      "h": "c5ee46"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "6",
              "packet_type": "history",
              "move_id": "4",
              "time": "1713261262",
              "data": [
                  {
                      "uid": "661e4ace15e10",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 1,
                          "route": {
                              "id": 3,
                              "from": 1,
                              "to": 18,
                              "number": 1,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1343,
                                      "y": 691,
                                      "angle": 35,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Atlanta",
                          "to": "Nashville",
                          "number": 1,
                          "colors": [
                              7
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "7",
              "packet_type": "history",
              "move_id": "5",
              "time": "1713262077",
              "data": [
                  {
                      "uid": "661e4dfda83bd",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 5
                      },
                      "h": "233c8e"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "8",
              "packet_type": "history",
              "move_id": "6",
              "time": "1713262079",
              "data": [
                  {
                      "uid": "661e4dff3e679",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 5
                      },
                      "h": "992783"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "10",
              "packet_type": "history",
              "move_id": "7",
              "time": "1713263283",
              "data": [
                  {
                      "uid": "661e52b3c5693",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "71e3f5"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "11",
              "packet_type": "history",
              "move_id": "8",
              "time": "1713263287",
              "data": [
                  {
                      "uid": "661e52b7b5564",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              2,
                              3
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "af42886e-630a-4537-821c-459c0f7194dc",
                      "h": "e38fd6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "12",
              "packet_type": "history",
              "move_id": "8",
              "time": "1713263287",
              "data": [
                  {
                      "uid": "661e52b7b52f8",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "e38fd6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "14",
              "packet_type": "history",
              "move_id": "9",
              "time": "1713263346",
              "data": [
                  {
                      "uid": "661e52f2201cb",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "0ce221"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "15",
              "packet_type": "history",
              "move_id": "10",
              "time": "1713263350",
              "data": [
                  {
                      "uid": "661e52f61a59b",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              6,
                              4
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "3ad648e5-d0fb-4b61-8ea5-2929c6a87ed1",
                      "h": "951ec1"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "16",
              "packet_type": "history",
              "move_id": "10",
              "time": "1713263350",
              "data": [
                  {
                      "uid": "661e52f61a345",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "951ec1"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "18",
              "packet_type": "history",
              "move_id": "11",
              "time": "1713263356",
              "data": [
                  {
                      "uid": "661e52fc66448",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 1
                      },
                      "h": "34fbb4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "20",
              "packet_type": "history",
              "move_id": "12",
              "time": "1713263361",
              "data": [
                  {
                      "uid": "661e5301b6d03",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 1
                      },
                      "h": "8ccfdc"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "21",
              "packet_type": "history",
              "move_id": "13",
              "time": "1713264136",
              "data": [
                  {
                      "uid": "661e56082a8ac",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              7,
                              8
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "929eebfc-c506-48c1-8a98-3e7a338cef38",
                      "h": "7da3d9"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "22",
              "packet_type": "history",
              "move_id": "13",
              "time": "1713264136",
              "data": [
                  {
                      "uid": "661e56082a668",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "7da3d9"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "24",
              "packet_type": "history",
              "move_id": "14",
              "time": "1713267164",
              "data": [
                  {
                      "uid": "661e61dc494d9",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "fe37b1"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "25",
              "packet_type": "history",
              "move_id": "15",
              "time": "1713268776",
              "data": [
                  {
                      "uid": "661e6828822df",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              4,
                              1
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "4e011abc-6b06-4d39-8dee-4891dc80e9b4",
                      "h": "49fef6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "26",
              "packet_type": "history",
              "move_id": "15",
              "time": "1713268776",
              "data": [
                  {
                      "uid": "661e682882093",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "49fef6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "28",
              "packet_type": "history",
              "move_id": "16",
              "time": "1713270526",
              "data": [
                  {
                      "uid": "661e6efe90cbd",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "349220"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "29",
              "packet_type": "history",
              "move_id": "17",
              "time": "1713273007",
              "data": [
                  {
                      "uid": "661e78af065f4",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              4,
                              6
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "ee607be3-bd21-4e84-859d-50ac35db18d3",
                      "h": "1d2170"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "30",
              "packet_type": "history",
              "move_id": "17",
              "time": "1713273007",
              "data": [
                  {
                      "uid": "661e78af064e9",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "1d2170"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "32",
              "packet_type": "history",
              "move_id": "18",
              "time": "1713274709",
              "data": [
                  {
                      "uid": "661e7f5587841",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "690068"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "33",
              "packet_type": "history",
              "move_id": "19",
              "time": "1713276141",
              "data": [
                  {
                      "uid": "661e84ed2b477",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              0,
                              4
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "bede5546-7d75-4fdc-8f8a-42786f5d2ddb",
                      "h": "7f7fa2"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "34",
              "packet_type": "history",
              "move_id": "19",
              "time": "1713276141",
              "data": [
                  {
                      "uid": "661e84ed2b35e",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "7f7fa2"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "36",
              "packet_type": "history",
              "move_id": "20",
              "time": "1713335841",
              "data": [
                  {
                      "uid": "661f6e217456e",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "190006"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "37",
              "packet_type": "history",
              "move_id": "21",
              "time": "1713337029",
              "data": [
                  {
                      "uid": "661f72c57eab9",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 7,
                          "route": {
                              "id": 73,
                              "from": 18,
                              "to": 24,
                              "number": 4,
                              "color": 4,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1296,
                                      "y": 621,
                                      "angle": -62,
                                      "top": false
                                  },
                                  {
                                      "x": 1332,
                                      "y": 565,
                                      "angle": -51,
                                      "top": false
                                  },
                                  {
                                      "x": 1381,
                                      "y": 520,
                                      "angle": -33,
                                      "top": false
                                  },
                                  {
                                      "x": 1428,
                                      "y": 476,
                                      "angle": -56,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Nashville",
                          "to": "Pittsburgh",
                          "number": 4,
                          "colors": [
                              4,
                              4,
                              4,
                              4
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "38",
              "packet_type": "history",
              "move_id": "22",
              "time": "1713340415",
              "data": [
                  {
                      "uid": "661f7ffed2c5d",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 2,
                          "route": {
                              "id": 7,
                              "from": 1,
                              "to": 26,
                              "number": 2,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1486,
                                      "y": 661,
                                      "angle": -41,
                                      "top": false
                                  },
                                  {
                                      "x": 1437,
                                      "y": 705,
                                      "angle": -41,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Atlanta",
                          "to": "Raleigh",
                          "number": 2,
                          "colors": [
                              4,
                              4
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "39",
              "packet_type": "history",
              "move_id": "23",
              "time": "1713340882",
              "data": [
                  {
                      "uid": "661f81d24ece8",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 2,
                          "route": {
                              "id": 84,
                              "from": 24,
                              "to": 33,
                              "number": 2,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1436,
                                      "y": 295,
                                      "angle": -93,
                                      "top": false
                                  },
                                  {
                                      "x": 1440,
                                      "y": 362,
                                      "angle": -93,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Pittsburgh",
                          "to": "Toronto",
                          "number": 2,
                          "colors": [
                              7,
                              7
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "40",
              "packet_type": "history",
              "move_id": "24",
              "time": "1713349415",
              "data": [
                  {
                      "uid": "661fa32778a1c",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 2,
                          "route": {
                              "id": 92,
                              "from": 26,
                              "to": 35,
                              "number": 2,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1556,
                                      "y": 593,
                                      "angle": -50,
                                      "top": false
                                  },
                                  {
                                      "x": 1598,
                                      "y": 543,
                                      "angle": -50,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Raleigh",
                          "to": "Washington",
                          "number": 2,
                          "colors": [
                              2,
                              2
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "41",
              "packet_type": "history",
              "move_id": "25",
              "time": "1713352847",
              "data": [
                  {
                      "uid": "661fb08f4e0e1",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              1,
                              1
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "d999642c-8249-489c-8b6f-5f41320dc496",
                      "h": "fb13b4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "42",
              "packet_type": "history",
              "move_id": "25",
              "time": "1713352847",
              "data": [
                  {
                      "uid": "661fb08f4dff3",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 2
                      },
                      "h": "fb13b4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "44",
              "packet_type": "history",
              "move_id": "26",
              "time": "1713353679",
              "data": [
                  {
                      "uid": "661fb3ceefc42",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 2,
                          "route": {
                              "id": 79,
                              "from": 20,
                              "to": 35,
                              "number": 2,
                              "color": 6,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1627,
                                      "y": 382,
                                      "angle": 87,
                                      "top": false
                                  },
                                  {
                                      "x": 1630,
                                      "y": 448,
                                      "angle": 87,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "New York",
                          "to": "Washington",
                          "number": 2,
                          "colors": [
                              6,
                              6
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "45",
              "packet_type": "history",
              "move_id": "27",
              "time": "1713356599",
              "data": [
                  {
                      "uid": "661fbf373ae46",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 2
                      },
                      "h": "3b0dff"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "46",
              "packet_type": "history",
              "move_id": "28",
              "time": "1713356601",
              "data": [
                  {
                      "uid": "661fbf38eabc2",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 2
                      },
                      "h": "dc3de1"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "47",
              "packet_type": "history",
              "move_id": "29",
              "time": "1713359176",
              "data": [
                  {
                      "uid": "661fc9480b0b0",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "Claudia81",
                          "color": 3
                      },
                      "h": "412be4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "49",
              "packet_type": "history",
              "move_id": "30",
              "time": "1713359180",
              "data": [
                  {
                      "uid": "661fc94c8768a",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 1
                      },
                      "h": "2da9a6"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "50",
              "packet_type": "history",
              "move_id": "31",
              "time": "1713360024",
              "data": [
                  {
                      "uid": "661fcc9879c2e",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              5
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "8054bab9-21cd-49f7-84ab-838a6e296c56",
                      "h": "d2570c"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "51",
              "packet_type": "history",
              "move_id": "31",
              "time": "1713360024",
              "data": [
                  {
                      "uid": "661fcc98799c1",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "d2570c"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "52",
              "packet_type": "history",
              "move_id": "32",
              "time": "1713360026",
              "data": [
                  {
                      "uid": "661fcc9ab08f2",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              8
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "325746a1-2ae7-4628-83c3-98963c26668a",
                      "h": "f2d0dc"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "53",
              "packet_type": "history",
              "move_id": "32",
              "time": "1713360026",
              "data": [
                  {
                      "uid": "661fcc9ab058f",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "f2d0dc"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "55",
              "packet_type": "history",
              "move_id": "33",
              "time": "1713361275",
              "data": [
                  {
                      "uid": "661fd1785a0c5",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "1cee8c"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "56",
              "packet_type": "history",
              "move_id": "34",
              "time": "1713362888",
              "data": [
                  {
                      "uid": "661fd7c89780f",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 8
                      },
                      "h": "df22ee"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "57",
              "packet_type": "history",
              "move_id": "35",
              "time": "1713362898",
              "data": [
                  {
                      "uid": "661fd7d2de436",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              3
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "4b2f45d4-1e3c-4ee9-8714-281c02487707",
                      "h": "f01aa5"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "58",
              "packet_type": "history",
              "move_id": "35",
              "time": "1713362899",
              "data": [
                  {
                      "uid": "661fd7d2de209",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "f01aa5"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "60",
              "packet_type": "history",
              "move_id": "36",
              "time": "1713366948",
              "data": [
                  {
                      "uid": "661fe7a4a2302",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "5dfdf2"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "61",
              "packet_type": "history",
              "move_id": "37",
              "time": "1713372172",
              "data": [
                  {
                      "uid": "661ffc0c3bab1",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 4,
                          "route": {
                              "id": 62,
                              "from": 14,
                              "to": 18,
                              "number": 3,
                              "color": 2,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1148,
                                      "y": 749,
                                      "angle": -4,
                                      "top": false
                                  },
                                  {
                                      "x": 1214,
                                      "y": 732,
                                      "angle": -24,
                                      "top": false
                                  },
                                  {
                                      "x": 1270,
                                      "y": 696,
                                      "angle": -41,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Little Rock",
                          "to": "Nashville",
                          "number": 3,
                          "colors": [
                              2,
                              2,
                              2
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "63",
              "packet_type": "history",
              "move_id": "38",
              "time": "1713372475",
              "data": [
                  {
                      "uid": "661ffd3ad05c0",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "115011"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "64",
              "packet_type": "history",
              "move_id": "39",
              "time": "1713372664",
              "data": [
                  {
                      "uid": "661ffdf8c4a18",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 2,
                          "route": {
                              "id": 64,
                              "from": 14,
                              "to": 21,
                              "number": 2,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 991,
                                      "y": 748,
                                      "angle": -2,
                                      "top": false
                                  },
                                  {
                                      "x": 1054,
                                      "y": 746,
                                      "angle": -2,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Little Rock",
                          "to": "Oklahoma City",
                          "number": 2,
                          "colors": [
                              3,
                              3
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "66",
              "packet_type": "history",
              "move_id": "40",
              "time": "1713372683",
              "data": [
                  {
                      "uid": "661ffe0af0131",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "d7353b"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "67",
              "packet_type": "history",
              "move_id": "41",
              "time": "1713372723",
              "data": [
                  {
                      "uid": "661ffe3354afd",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 7,
                          "route": {
                              "id": 5,
                              "from": 1,
                              "to": 19,
                              "number": 4,
                              "color": 5,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1251,
                                      "y": 924,
                                      "angle": 291,
                                      "top": false
                                  },
                                  {
                                      "x": 1282,
                                      "y": 865,
                                      "angle": 303,
                                      "top": false
                                  },
                                  {
                                      "x": 1321,
                                      "y": 813,
                                      "angle": 310,
                                      "top": false
                                  },
                                  {
                                      "x": 1366,
                                      "y": 767,
                                      "angle": 319,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Atlanta",
                          "to": "New Orleans",
                          "number": 4,
                          "colors": [
                              5,
                              5,
                              5,
                              5
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "69",
              "packet_type": "history",
              "move_id": "42",
              "time": "1713372727",
              "data": [
                  {
                      "uid": "661ffe379c97d",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "e8f363"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "70",
              "packet_type": "history",
              "move_id": "43",
              "time": "1713372735",
              "data": [
                  {
                      "uid": "661ffe3f65c57",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "chooosen",
                          "points": 4,
                          "route": {
                              "id": 63,
                              "from": 14,
                              "to": 19,
                              "number": 3,
                              "color": 8,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1127,
                                      "y": 797,
                                      "angle": 63,
                                      "top": false
                                  },
                                  {
                                      "x": 1156,
                                      "y": 854,
                                      "angle": 63,
                                      "top": false
                                  },
                                  {
                                      "x": 1188,
                                      "y": 912,
                                      "angle": 63,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Little Rock",
                          "to": "New Orleans",
                          "number": 3,
                          "colors": [
                              8,
                              8,
                              8
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "72",
              "packet_type": "history",
              "move_id": "44",
              "time": "1713372738",
              "data": [
                  {
                      "uid": "661ffe42316c6",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 4,
                          "route": {
                              "id": 70,
                              "from": 17,
                              "to": 20,
                              "number": 3,
                              "color": 3,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1565,
                                      "y": 152,
                                      "angle": 80,
                                      "top": false
                                  },
                                  {
                                      "x": 1575,
                                      "y": 217,
                                      "angle": 80,
                                      "top": false
                                  },
                                  {
                                      "x": 1586,
                                      "y": 280,
                                      "angle": 80,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Montréal",
                          "to": "New York",
                          "number": 3,
                          "colors": [
                              3,
                              3,
                              0
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "73",
              "packet_type": "history",
              "move_id": "45",
              "time": "1713373514",
              "data": [
                  {
                      "uid": "6620014a46797",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 1
                      },
                      "h": "7dcf35"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "74",
              "packet_type": "history",
              "move_id": "46",
              "time": "1713373520",
              "data": [
                  {
                      "uid": "6620014fe9196",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 4
                      },
                      "h": "006448"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "77",
              "packet_type": "history",
              "move_id": "48",
              "time": "1713376418",
              "data": [
                  {
                      "uid": "66200ca25d4c0",
                      "type": "destinationsPicked",
                      "log": "${player_name} keeps ${count} destinations",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 1
                      },
                      "h": "ef44d6"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "78",
              "packet_type": "history",
              "move_id": "49",
              "time": "1713376813",
              "data": [
                  {
                      "uid": "66200e2d8decb",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              8
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "9086c966-681f-4b19-89f6-865a97e0303e",
                      "h": "7ee267"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "79",
              "packet_type": "history",
              "move_id": "49",
              "time": "1713376813",
              "data": [
                  {
                      "uid": "66200e2d8dc58",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "7ee267"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "80",
              "packet_type": "history",
              "move_id": "50",
              "time": "1713376816",
              "data": [
                  {
                      "uid": "66200e3045769",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              4
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "72c38d91-e2f1-4cd0-874f-3b471790c41a",
                      "h": "9f435f"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "81",
              "packet_type": "history",
              "move_id": "50",
              "time": "1713376816",
              "data": [
                  {
                      "uid": "66200e304547a",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "9f435f"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "82",
              "packet_type": "history",
              "move_id": "51",
              "time": "1713378376",
              "data": [
                  {
                      "uid": "6620144807860",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 2,
                          "route": {
                              "id": 11,
                              "from": 2,
                              "to": 20,
                              "number": 2,
                              "color": 7,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1686,
                                      "y": 250,
                                      "angle": 122,
                                      "top": false
                                  },
                                  {
                                      "x": 1652,
                                      "y": 305,
                                      "angle": 122,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Boston",
                          "to": "New York",
                          "number": 2,
                          "colors": [
                              7,
                              7
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "83",
              "packet_type": "history",
              "move_id": "52",
              "time": "1713379428",
              "data": [
                  {
                      "uid": "66201864a51cd",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              8
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "fd211bb1-ea7b-4f1e-8daf-b3ef7415d7fe",
                      "h": "5277b6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "84",
              "packet_type": "history",
              "move_id": "52",
              "time": "1713379428",
              "data": [
                  {
                      "uid": "66201864a50a1",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "5277b6"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "85",
              "packet_type": "history",
              "move_id": "53",
              "time": "1713379431",
              "data": [
                  {
                      "uid": "66201867cc35c",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${color}",
                      "args": {
                          "player_name": "chooosen",
                          "color": 7
                      },
                      "h": "fe1f90"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "87",
              "packet_type": "history",
              "move_id": "54",
              "time": "1713380698",
              "data": [
                  {
                      "uid": "66201d5a115e6",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "Claudia81",
                          "count": 2
                      },
                      "h": "743125"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "88",
              "packet_type": "history",
              "move_id": "55",
              "time": "1713380770",
              "data": [
                  {
                      "uid": "66201da20f951",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              2
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "c0c42c97-b004-46f1-80f0-0040128b64af",
                      "h": "1536eb"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "89",
              "packet_type": "history",
              "move_id": "55",
              "time": "1713380770",
              "data": [
                  {
                      "uid": "66201da20f6f2",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "1536eb"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "90",
              "packet_type": "history",
              "move_id": "56",
              "time": "1713380772",
              "data": [
                  {
                      "uid": "66201da4b70da",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              1
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "5311c2f3-f57e-46b0-8d6c-8c13901c1dd6",
                      "h": "948ef4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "91",
              "packet_type": "history",
              "move_id": "56",
              "time": "1713380772",
              "data": [
                  {
                      "uid": "66201da4b6ead",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "948ef4"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "92",
              "packet_type": "history",
              "move_id": "57",
              "time": "1713384231",
              "data": [
                  {
                      "uid": "66202b2766e08",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 7,
                          "route": {
                              "id": 15,
                              "from": 4,
                              "to": 16,
                              "number": 4,
                              "color": 1,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1567,
                                      "y": 786,
                                      "angle": 87,
                                      "top": false
                                  },
                                  {
                                      "x": 1572,
                                      "y": 852,
                                      "angle": 82,
                                      "top": false
                                  },
                                  {
                                      "x": 1588,
                                      "y": 917,
                                      "angle": 73,
                                      "top": false
                                  },
                                  {
                                      "x": 1614,
                                      "y": 976,
                                      "angle": 59,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Charleston",
                          "to": "Miami",
                          "number": 4,
                          "colors": [
                              1,
                              1,
                              1,
                              1
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "93",
              "packet_type": "history",
              "move_id": "58",
              "time": "1713384539",
              "data": [
                  {
                      "uid": "66202c5b52ccd",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              5
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "be31bc0f-3dc8-43cc-833d-05a18fd2f805",
                      "h": "0a37ac"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "94",
              "packet_type": "history",
              "move_id": "58",
              "time": "1713384539",
              "data": [
                  {
                      "uid": "66202c5b5297f",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "0a37ac"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "95",
              "packet_type": "history",
              "move_id": "59",
              "time": "1713384546",
              "data": [
                  {
                      "uid": "66202c5f593ec",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              6
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "96082887-bea8-4f8d-85cf-2332f1714d20",
                      "h": "2d593e"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "96",
              "packet_type": "history",
              "move_id": "59",
              "time": "1713384546",
              "data": [
                  {
                      "uid": "66202c5f59159",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "2d593e"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "98",
              "packet_type": "history",
              "move_id": "60",
              "time": "1713414067",
              "data": [
                  {
                      "uid": "66209fb30ad0e",
                      "type": "claimedRoute",
                      "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                      "args": {
                          "player_name": "Claudia81",
                          "points": 2,
                          "route": {
                              "id": 1,
                              "from": 1,
                              "to": 4,
                              "number": 2,
                              "color": 0,
                              "tunnel": false,
                              "locomotives": 0,
                              "spaces": [
                                  {
                                      "x": 1450,
                                      "y": 747,
                                      "angle": 3,
                                      "top": false
                                  },
                                  {
                                      "x": 1516,
                                      "y": 749,
                                      "angle": 3,
                                      "top": false
                                  }
                              ]
                          },
                          "from": "Atlanta",
                          "to": "Charleston",
                          "number": 2,
                          "colors": [
                              5,
                              5
                          ]
                      }
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "99",
              "packet_type": "history",
              "move_id": "61",
              "time": "1713425316",
              "data": [
                  {
                      "uid": "6620cba4c46ef",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              0
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "fa7ae43f-b604-4676-8b76-90d20116bc0d",
                      "h": "b5c82a"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "100",
              "packet_type": "history",
              "move_id": "61",
              "time": "1713425316",
              "data": [
                  {
                      "uid": "6620cba4c4550",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "b5c82a"
                  }
              ]
          },
          {
              "channel": "/player/p95232426",
              "table_id": "500450283",
              "packet_id": "101",
              "packet_type": "history",
              "move_id": "62",
              "time": "1713425321",
              "data": [
                  {
                      "uid": "6620cba93adbc",
                      "type": "trainCarPicked",
                      "log": "You take hidden train car card(s) ${colors}",
                      "args": {
                          "colors": [
                              0
                          ]
                      },
                      "synchro": 1,
                      "lock_uuid": "b767ff9c-f48d-44a5-8f93-b2ffcc457434",
                      "h": "b50b8c"
                  }
              ]
          },
          {
              "channel": "/table/t500450283",
              "table_id": "500450283",
              "packet_id": "102",
              "packet_type": "history",
              "move_id": "62",
              "time": "1713425321",
              "data": [
                  {
                      "uid": "6620cba93ab0e",
                      "type": "trainCarPicked",
                      "log": "${player_name} takes ${count} hidden train car card(s)",
                      "args": {
                          "player_name": "chooosen",
                          "count": 1
                      },
                      "h": "b50b8c"
                  }
              ]
          }
      ]
  }
};

const packets = input.data.data.map(entry => PacketFactory.create(entry));
const actionablePackets = packets.filter(packet => [classes.ClaimedRoute, classes.TrainCarPicked].includes(packet.constructor));
const globalPackets = actionablePackets.filter(packet => packet.global());
const myPackets = actionablePackets.filter(packet => !packet.global());

myPackets.forEach(packet => {
  const index = globalPackets.findIndex(gPacket => gPacket.moveId() === packet.moveId());
  globalPackets[index] = packet;
});
const readyPackets = globalPackets;

const visibleCards = {
  Locomotive: 1,
  Red: 2,
  Orange: 2
};
const startSetup = {
  Locomotive: 1,
  Orange: 1,
  Red: 2
};

const state = new State(visibleCards, startSetup, { myLeftTrains: 27, enemyLeftTrains: 27 });
// console.log(JSON.stringify(state));

readyPackets.forEach(packet => packet.call(state));
// state.outputCurrentState();
state.checkValid()
console.log(state.export_to_excel())
console.log(`enemy is ${readyPackets.find(packet => !packet.me()).player()}`);
console.log(`Game/Table id is ${readyPackets[0].table_id()}`);
