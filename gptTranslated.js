const MY_NAME = 'chooosen'

class BasePacket {
  constructor(hash) {
    this.packetData = new PacketData({ ...hash, packet_id: undefined });
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

  data() {
    if (this.packetData.data.length > 1) {
      throw new Error(`we do not handle multiple data in packet: ${this.packetData}`);
    }
    return this.packetData.data[0];
  }
}

class ClaimedRoute extends BasePacket {
  call(state) {
    const { length: routeLength, colors: colors_a } = this.data().args;
    const locomotives = colors_a.filter(color => color === COLORS_MAPPING.Locomotive).length;
    const colorNumber = colors_a.find(color => color !== COLORS_MAPPING.Locomotive) || COLORS_MAPPING.Locomotive;
    const color = NUMBER_TO_COLORS_MAPPING[colorNumber];

    if (this.me()) {
      return state.myCardUse({ color, length: routeLength, locomotives });
    } else {
      return state.enemyCardUse({ color, length: routeLength, locomotives });
    }
  }
}

class TrainCarPicked extends BasePacket {
  call(state) {
    const { color, count } = this.data().args;
    const colors_a = this.data().args.colors;

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

class SimpleNote extends BasePacket {
  call() {
    console.log(this.data().log);
  }
}

class DestinationsPicked extends BasePacket {
  call() {
    console.log(this.data().log);
  }
}

class State {
  constructor(visibleCards, startSetup, { myLeftTrains, enemyLeftTrains }) {
    this.visibleCards = visibleCards;
    this.myCards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(color => [color, 0]));
    Object.entries(startSetup).forEach(([color, number]) => this.myCards[color] = number);
    this.myUsedCards = { ...this.myCards };
    this.enemyCards = { ...this.myCards, Unknown: 0 };
    this.enemyUsedCards = { ...this.myCards };
    this.enemyLeftTrains = enemyLeftTrains;
    this.myLeftTrains = myLeftTrains;
  }

  enemyTakeCard(color = 'Unknown') {
    this.enemyCards[color]++;
  }

  myTakeCard(color) {
    this.myCards[color]++;
    console.log(this.myCards);
  }

  myCardUse({ color, length, locomotives = 0 }) {
    const colorLength = length - locomotives;
    this.myUsedCards[color] += colorLength;
    this.myCards[color] -= colorLength;
    this.myUsedCards.Locomotive += locomotives;
  }

  enemyCardUse({ color, length, locomotives = 0 }) {
    const colorLength = length - locomotives;
    this.enemyUsedCards[color] += colorLength;
    this.enemyCards[color] = Math.max(this.enemyCards[color] - colorLength, 0);
    this.enemyCards.Unknown -= colorLength - this.enemyCards[color];
    this.enemyUsedCards.Locomotive += locomotives;
  }

  outputCurrentState() {
    console.log(this);
    console.log(`My Cards used: ${Object.values(this.myUsedCards).reduce((acc, val) => acc + val, 0)}`);
    console.log(`My Cards in hand: ${Object.values(this.myCards).reduce((acc, val) => acc + val, 0)}`);
    console.log(`Enemy Cards used: ${Object.values(this.enemyUsedCards).reduce((acc, val) => acc + val, 0)}`);
    console.log(`Enemy Cards in hand: ${Object.values(this.enemyCards).reduce((acc, val) => acc + val, 0)}`);
  }
}

const PacketFactory = {
  create: (hash) => {
    switch (true) {
      case hash.data.length > 2:
        throw new Error(`We do not support multiple data in packet ${JSON.stringify(hash)}`);
      case hash.data.length === 1 && hash.data[0].type:
        const moveType = hash.data[0].type;
        const ClassName = `${moveType[0].toUpperCase()}${moveType.slice(1)}`;
        return new Object[ClassName](hash); // window[ClassName] ?
      case hash.data.length === 1 && !hash.data[0].type:
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

h = {
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
          }
      ]
  }
} ; 0

const packets = h.data.data.map(entry => PacketFactory.create(entry));
const actionablePackets = packets.filter(packet => [ClaimedRoute, TrainCarPicked].includes(packet.constructor));
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
const state = new State(visibleCards, startSetup, { myLeftTrains: 27, enemyLeftTrains: 29 });

readyPackets.forEach(packet => packet.call(state));
state.outputCurrentState();
