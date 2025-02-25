const MY_NAME = Object.freeze("chooosen");

const COLORS_MAPPING = Object.freeze({
    Locomotive: 0,
    Pink: 1,
    White: 2,
    Blue: 3,
    Yellow: 4,
    Orange: 5,
    Black: 6,
    Red: 7,
    Green: 8,
});

const NUMBER_TO_COLORS_MAPPING = Object.fromEntries(
    Object.entries(COLORS_MAPPING).map(([key, value]) => [value, key])
);

class BasePacket {
    #packet_data;

    constructor(hash) {
        this.#packet_data = hash;
    }

    get packet_type() {
        return this.#packet_data.packet_type;
    }

    get move_id() {
        return this.#packet_data.move_id;
    }

    get global() {
        return this.#packet_data.channel.includes("table");
    }

    get me() {
        return !this.global || this.player === MY_NAME;
    }

    get player() {
        return this.data?.args?.player_name;
    }

    get table_id() {
        return this.#packet_data.table_id;
    }

    get data() {
        return this.#packet_data.data[0];
    }

    // debug
    get packet_data() {
        return this.#packet_data
    }
}

class ClaimedRoute extends BasePacket {
    call(state) {
        const { args: { number: length, colors: colors_a } } = this.data;

        const locomotives = colors_a.filter(color => color === COLORS_MAPPING.Locomotive).length;
        const color_number = (colors_a.filter(color => color !== COLORS_MAPPING.Locomotive)[0]) ?? COLORS_MAPPING.Locomotive;
        const color = NUMBER_TO_COLORS_MAPPING[color_number];

        if (this.me) {
            return state.my_card_use({ color, length, locomotives });
        }

        return state.enemy_card_use({ color, length, locomotives });
    }
}

class TrainCarPicked extends BasePacket {
    call(state) {
        const args = this.data?.args;
        const color = args?.color;

        if (this.me) {
            if (color) {
                return state.my_take_card({ color: NUMBER_TO_COLORS_MAPPING[color] });
            }

            const { args: { colors: colors_a } } = this.data;
            if (colors_a.length === 2) {
                return state.my_take_card({ color: NUMBER_TO_COLORS_MAPPING[colors_a[1]] });
            }

            return state.my_take_card({ color: NUMBER_TO_COLORS_MAPPING[colors_a[0]] });
        }

        if (color) {
            return state.enemy_take_card({ color: NUMBER_TO_COLORS_MAPPING[color] });
        }

        const { args: { count } } = this.data;
        if (count === 2) {
            state.enemy_take_card({});
        }

        state.enemy_take_card({});
    }
}

class SimpleNote extends BasePacket {
    call() {
        console.log(this.data.log);
    }
}

const PacketClasses = {
    'claimedRoute': ClaimedRoute,
    'trainCarPicked': TrainCarPicked,
    'destinationsPicked': SimpleNote,
    'destinationCompleted': SimpleNote,
    'destinationCompleted': SimpleNote,
}

let handler = {
    get: function (target, name) {
        return target.hasOwnProperty(name) ? target[name] : SimpleNote;
    }
}
const WithDefaultValuePacketClasses = new Proxy(PacketClasses, handler)

const PacketFactory = {
    create(hash) {
        switch (true) {
            case Array.isArray(hash.data) && hash.data.length >= 2 && hash.data[1]?.type === "highlightVisibleLocomotives": {
                const move_type = hash.data[0].type;
                return new WithDefaultValuePacketClasses[move_type](hash);
            }

            case Array.isArray(hash.data) && hash.data.length > 2:
                throw new Error(`We do not support multiple data other than highlightVisibleLocomotives in packet ${JSON.stringify(hash)}`);

            case Array.isArray(hash.data) && hash.data.length === 1: {
                const move_type = hash.data[0].type;
                return new WithDefaultValuePacketClasses[move_type](hash);
            }

            case Array.isArray(hash.data) && hash.data.length === 0:
                throw new Error(`Missing move object data ${JSON.stringify(hash)}`);

            case !Array.isArray(hash.data):
                throw new Error(`data ${JSON.stringify(hash.data)} in packet should be array ${JSON.stringify(hash)}`);

            default:
                throw new Error(`Missing data in packet ${JSON.stringify(hash)}`);
        }
    }
};

class State {
    static parse_js() {
        // TODO: get formatted data from Window
        const data = window.result;

        let { visible_cards, start_setup, player_stats } = data;

        const [my_stats] = player_stats.filter(stat => stat.name === MY_NAME);
        const [other_stats] = player_stats.filter(stat => stat.name !== MY_NAME);

        const my_left_trains = my_stats.remainingTrainCarsCount;
        const my_left_cards = my_stats.trainCarsCount;
        const enemy_left_trains = other_stats.remainingTrainCarsCount;
        const enemy_left_cards = other_stats.trainCarsCount;

        console.log("Enemy owned destinations:");
        console.log(other_stats.claimedRoutes.join("\n"));

        visible_cards = Object.fromEntries(
            Object.entries(visible_cards).map(([key, value]) => [NUMBER_TO_COLORS_MAPPING[parseInt(key)], value])
        );
        start_setup = Object.fromEntries(
            Object.entries(start_setup).map(([key, value]) => [NUMBER_TO_COLORS_MAPPING[parseInt(key)], value])
        );

        const params = { my_left_trains, enemy_left_trains, my_left_cards, enemy_left_cards };
        return new State(visible_cards, start_setup, params);
    }

    constructor(visible_cards, start_setup, { my_left_trains, enemy_left_trains, my_left_cards = null, enemy_left_cards = null }) {
        this.visible_cards = visible_cards;
        this.my_cards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(key => [key, 0]));
        this.start_setup = start_setup;
        for (const [color, number] of Object.entries(start_setup)) {
            this.my_cards[color] = number;
        }
        this.my_used_cards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(key => [key, 0]));
        this.enemy_cards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(key => [key, 0]));
        this.enemy_cards.Unknown = 4;
        this.enemy_used_cards = Object.fromEntries(Object.keys(COLORS_MAPPING).map(key => [key, 0]));
        this.enemy_left_trains = enemy_left_trains;
        this.my_left_trains = my_left_trains;
        this.my_left_cards = my_left_cards;
        this.enemy_left_cards = enemy_left_cards;
    }

    enemy_take_card({ color = "Unknown" }) {
        this.enemy_cards[color] += 1;
    }

    my_take_card({ color }) {
        this.my_cards[color] += 1;
    }

    my_card_use({ color, length, locomotives = 0 }) {
        const color_length = length - locomotives;
        this.my_used_cards[color] += color_length;
        this.my_cards[color] -= color_length;
        this.my_used_cards.Locomotive += locomotives;
        this.my_cards.Locomotive -= locomotives;
    }

    enemy_card_use({ color, length, locomotives = 0 }) {
        const color_length = length - locomotives;

        this.enemy_used_cards[color] += color_length;
        this.enemy_used_cards.Locomotive += locomotives;

        const color_card_known = Math.min(this.enemy_cards[color], color_length);
        const locomotives_known = Math.min(this.enemy_cards.Locomotive, locomotives);

        this.enemy_cards[color] -= color_card_known;
        this.enemy_cards.Locomotive -= locomotives_known;
        this.enemy_cards.Unknown -= length - color_card_known - locomotives_known;
    }

    output_current_state() {
        console.log(this);
        console.log(`Verify: My Cards in hand (${this.my_cards_with_js_load_fix().reduce((acc, value) => acc + value, 0)}): ${this.my_cards_with_js_load_fix()}`);
        console.log(`Verify: Enemy Cards in hand: ${Object.values(this.enemy_cards).reduce((acc, value) => acc + value, 0)}`);
    }

    valid() {
        console.log(`Verify: My Cards used: ${this.my_used_cards_number()}`);
        console.log(`Verify: Enemy Cards used: ${Object.values(this.enemy_used_cards).reduce((acc, value) => acc + value, 0)}`);
        const valid_card_trains_and_used_cards =
            45 * 2 - (this.my_left_trains + this.enemy_left_trains) === this.my_used_cards_number() + Object.values(this.enemy_used_cards).reduce((acc, value) => acc + value, 0);

        if (this.valid_enemy_cards_number() && valid_card_trains_and_used_cards) {
            console.log("All Valid, based on number of trains and log");
            return true;
        } else {
            console.log("ERROR, based on number of trains and log");
            return false;
        }
    }

    valid_enemy_cards_number() {
        if (this.enemy_left_cards == null) {
            console.log("Skipping validate as no state from JS");
            return true;
        }
        if (this.enemy_left_cards === Object.values(this.enemy_cards).reduce((acc, value) => acc + value, 0)) {
            console.log("Valid JS state of game with sync of history actions");
            return true;
        } else {
            console.log("Invalid JS state of game with sync of history actions");
            return false;
        }
    }

    export_to_excel() {
        return Object.keys(COLORS_MAPPING).map(color => {
            const row = [
                this.replace_zero_with_empty_string(this.my_used_cards[color] + this.enemy_used_cards[color]),
                this.replace_zero_with_empty_string(this.my_cards_with_js_load_fix()[color]),
                this.replace_zero_with_empty_string(this.enemy_cards[color]),
                this.replace_zero_with_empty_string(this.visible_cards[color]) || ""
            ];
            return row.join("\t");
        }).join("\n");
    }

    export_enemy_moves_excel() {
        const enemy_moves = Object.keys(COLORS_MAPPING).map(color =>
            this.replace_zero_with_empty_string(this.enemy_used_cards[color])
        );

        if (enemy_moves.every(value => value === "")) {
            console.log("> No visible cards from user <");
        } else {
            console.log("Enemy moves:");
            console.log(enemy_moves.join("\n"));
        }
    }

    my_used_cards_number() {
        return Object.values(this.my_used_cards).reduce((acc, value) => acc + value, 0);
    }

    my_cards_with_js_load_fix() {
        return Object.values(this.start_setup).reduce((acc, value) => acc + value, 0) === 4
            ? this.my_cards
            : this.start_setup;
    }

    replace_zero_with_empty_string(value) {
        return value === 0 ? "" : value;
    }
}

// Main function equivalent
function main(input) {
    const packets = input.data.data.map(entry => PacketFactory.create(entry));

    const actionable_packets = packets.filter(packet => [ClaimedRoute, TrainCarPicked].includes(packet.constructor));

    const global_packets = actionable_packets.filter(packet => packet.global);
    const my_packets = actionable_packets.filter(packet => !packet.global);

    my_packets.forEach(packet => {
        const index = global_packets.findIndex(g_packet => g_packet.move_id === packet.move_id);
        global_packets[index] = packet;
    });

    const ready_packets = global_packets;

    const state = State.parse_js();

    ready_packets.forEach(packet => packet.call(state));

    if (state.valid()) {
        console.log(state.export_to_excel());
        console.log(`enemy is ${ready_packets.find(packet => !packet.me).player}`);
        console.log(`Game/Table id is ${packets[0].table_id}`);
        console.log(`Game started by ${ready_packets?.[0]?.player || "//waiting for first move"}`);
        state.export_enemy_moves_excel();
    }
}

// TODO: take input from ChatHistory response
const ChatHistory = {
    "status": 1,
    "data": {
        "valid": 1,
        "data": [
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "3",
                "packet_type": "history",
                "move_id": "1",
                "time": "1718698565",
                "data": [
                    {
                        "uid": "66714245b3e72",
                        "type": "simpleNote",
                        "log": "Color of ${players} has been chosen according to his/her preferences. ${change_preferences}",
                        "args": {
                            "players": "<b><span style=\"color:#e3001a\">menettm</span></b>",
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "4",
                "packet_type": "history",
                "move_id": "2",
                "time": "1718702238",
                "data": [
                    {
                        "uid": "6671509e5d919",
                        "type": "destinationsPicked",
                        "log": "${player_name} keeps ${count} destinations",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "cff251"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "5",
                "packet_type": "history",
                "move_id": "3",
                "time": "1718801211",
                "data": [
                    {
                        "uid": "6672d33bc6f55",
                        "type": "destinationsPicked",
                        "log": "${player_name} keeps ${count} destinations",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "d3af81"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "7",
                "packet_type": "history",
                "move_id": "4",
                "time": "1718801231",
                "data": [
                    {
                        "uid": "6672d34fd208b",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "8d069c"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "8",
                "packet_type": "history",
                "move_id": "5",
                "time": "1718802836",
                "data": [
                    {
                        "uid": "6672d99449032",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "7dfe656d-df53-4864-8d50-657f55a06d42",
                        "h": "2149ed"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "9",
                "packet_type": "history",
                "move_id": "5",
                "time": "1718802836",
                "data": [
                    {
                        "uid": "6672d99448ed9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "2149ed"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "10",
                "packet_type": "history",
                "move_id": "6",
                "time": "1718802840",
                "data": [
                    {
                        "uid": "6672d9988aa1d",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "4623a1c3-daf7-4bd6-89a8-9392bbfc66c6",
                        "h": "859be9"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "11",
                "packet_type": "history",
                "move_id": "6",
                "time": "1718802840",
                "data": [
                    {
                        "uid": "6672d9988a94a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "859be9"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "13",
                "packet_type": "history",
                "move_id": "7",
                "time": "1718803105",
                "data": [
                    {
                        "uid": "6672daa1122ac",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "3c99f0"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "14",
                "packet_type": "history",
                "move_id": "8",
                "time": "1718805686",
                "data": [
                    {
                        "uid": "6672e4b652109",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "06375931-0abb-42b0-8dfd-a814c38a53fd",
                        "h": "aa83f0"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "15",
                "packet_type": "history",
                "move_id": "8",
                "time": "1718805686",
                "data": [
                    {
                        "uid": "6672e4b652022",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "aa83f0"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "16",
                "packet_type": "history",
                "move_id": "9",
                "time": "1718805688",
                "data": [
                    {
                        "uid": "6672e4b86d3ba",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "21d27f0f-8eac-43c6-8591-ce0bfc125b6c",
                        "h": "bb5c3e"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "17",
                "packet_type": "history",
                "move_id": "9",
                "time": "1718805688",
                "data": [
                    {
                        "uid": "6672e4b86d2b9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "bb5c3e"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "19",
                "packet_type": "history",
                "move_id": "10",
                "time": "1718809357",
                "data": [
                    {
                        "uid": "6672f30d13987",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "66e45a"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "20",
                "packet_type": "history",
                "move_id": "11",
                "time": "1718810274",
                "data": [
                    {
                        "uid": "6672f6a26b15f",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "e0a874ae-2c2c-4ba3-82df-f0fedee5ba6d",
                        "h": "e03914"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "21",
                "packet_type": "history",
                "move_id": "11",
                "time": "1718810274",
                "data": [
                    {
                        "uid": "6672f6a26b01f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "e03914"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "22",
                "packet_type": "history",
                "move_id": "12",
                "time": "1718810276",
                "data": [
                    {
                        "uid": "6672f6a43d9ed",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "49504dea-8561-4133-8bbe-fd21d9a0bb20",
                        "h": "164cb5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "23",
                "packet_type": "history",
                "move_id": "12",
                "time": "1718810276",
                "data": [
                    {
                        "uid": "6672f6a43d92a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "164cb5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "25",
                "packet_type": "history",
                "move_id": "13",
                "time": "1718810290",
                "data": [
                    {
                        "uid": "6672f6b24375d",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "4cd0fc"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "26",
                "packet_type": "history",
                "move_id": "14",
                "time": "1718835379",
                "data": [
                    {
                        "uid": "667358b3b2339",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                1
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "69e7a961-0cbd-465b-831b-369a8fe4d771",
                        "h": "2655f5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "27",
                "packet_type": "history",
                "move_id": "14",
                "time": "1718835379",
                "data": [
                    {
                        "uid": "667358b3b227c",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "2655f5"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "28",
                "packet_type": "history",
                "move_id": "15",
                "time": "1718835382",
                "data": [
                    {
                        "uid": "667358b5e3d2b",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "fb9c63ca-7dcf-4e30-8de2-140608cfeb12",
                        "h": "07bdff"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "29",
                "packet_type": "history",
                "move_id": "15",
                "time": "1718835382",
                "data": [
                    {
                        "uid": "667358b5e3c31",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "07bdff"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "31",
                "packet_type": "history",
                "move_id": "16",
                "time": "1718859927",
                "data": [
                    {
                        "uid": "6673b897537c8",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "a6d35e"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "32",
                "packet_type": "history",
                "move_id": "17",
                "time": "1718861156",
                "data": [
                    {
                        "uid": "6673bd64743e4",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                2
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "d39e51c6-4216-4be1-81b3-c12a9e836b12",
                        "h": "2689a5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "33",
                "packet_type": "history",
                "move_id": "17",
                "time": "1718861156",
                "data": [
                    {
                        "uid": "6673bd6474339",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "2689a5"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "34",
                "packet_type": "history",
                "move_id": "18",
                "time": "1718861158",
                "data": [
                    {
                        "uid": "6673bd6691686",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "2bb6694a-0991-4338-837e-c94fabb0f656",
                        "h": "cf6dab"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "35",
                "packet_type": "history",
                "move_id": "18",
                "time": "1718861158",
                "data": [
                    {
                        "uid": "6673bd66913cc",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "cf6dab"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "37",
                "packet_type": "history",
                "move_id": "19",
                "time": "1718861180",
                "data": [
                    {
                        "uid": "6673bd7c9f9a9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "619b6c"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "38",
                "packet_type": "history",
                "move_id": "20",
                "time": "1718861404",
                "data": [
                    {
                        "uid": "6673be5c94ba1",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                3
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "c7d78d34-85b2-47e7-8849-e9062b89b96b",
                        "h": "55e92b"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "39",
                "packet_type": "history",
                "move_id": "20",
                "time": "1718861404",
                "data": [
                    {
                        "uid": "6673be5c94ad5",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "55e92b"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "40",
                "packet_type": "history",
                "move_id": "21",
                "time": "1718861406",
                "data": [
                    {
                        "uid": "6673be5e8b6b2",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "983c6b95-d71d-446b-811a-501f855d374d",
                        "h": "ed7b10"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "41",
                "packet_type": "history",
                "move_id": "21",
                "time": "1718861406",
                "data": [
                    {
                        "uid": "6673be5e8b5a8",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "ed7b10"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "43",
                "packet_type": "history",
                "move_id": "22",
                "time": "1718861540",
                "data": [
                    {
                        "uid": "6673bee4b7f27",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "c2b15a"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "44",
                "packet_type": "history",
                "move_id": "23",
                "time": "1718871599",
                "data": [
                    {
                        "uid": "6673e62f11a85",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                2,
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "7e4c6083-6170-4d80-8d08-25440649e7b4",
                        "h": "d360d6"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "45",
                "packet_type": "history",
                "move_id": "23",
                "time": "1718871599",
                "data": [
                    {
                        "uid": "6673e62f119dd",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "d360d6"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "47",
                "packet_type": "history",
                "move_id": "24",
                "time": "1718873944",
                "data": [
                    {
                        "uid": "6673ef5804b04",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "11e470"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "48",
                "packet_type": "history",
                "move_id": "25",
                "time": "1718876888",
                "data": [
                    {
                        "uid": "6673fad8bbf41",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                3
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "8abfc3e1-08f5-4c0a-82ba-fde10fa246eb",
                        "h": "2ec23d"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "49",
                "packet_type": "history",
                "move_id": "25",
                "time": "1718876888",
                "data": [
                    {
                        "uid": "6673fad8bbe7d",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "2ec23d"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "51",
                "packet_type": "history",
                "move_id": "26",
                "time": "1718876913",
                "data": [
                    {
                        "uid": "6673faf192451",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "4a0589"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "52",
                "packet_type": "history",
                "move_id": "27",
                "time": "1718876952",
                "data": [
                    {
                        "uid": "6673fb189754a",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                1,
                                1
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "4fa6e96c-fa6f-4c75-8064-e74b91cb8cf7",
                        "h": "0b7b40"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "53",
                "packet_type": "history",
                "move_id": "27",
                "time": "1718876952",
                "data": [
                    {
                        "uid": "6673fb18974a0",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "0b7b40"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "55",
                "packet_type": "history",
                "move_id": "28",
                "time": "1718877012",
                "data": [
                    {
                        "uid": "6673fb542015e",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "293e9d"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "56",
                "packet_type": "history",
                "move_id": "29",
                "time": "1718877048",
                "data": [
                    {
                        "uid": "6673fb788ae16",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6,
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "0b377e26-4ced-4ee2-88a5-613e2a8efb7d",
                        "h": "7eed9f"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "57",
                "packet_type": "history",
                "move_id": "29",
                "time": "1718877048",
                "data": [
                    {
                        "uid": "6673fb788acaf",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "7eed9f"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "59",
                "packet_type": "history",
                "move_id": "30",
                "time": "1718877224",
                "data": [
                    {
                        "uid": "6673fc28636e7",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "0ce9ef"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "60",
                "packet_type": "history",
                "move_id": "31",
                "time": "1718877552",
                "data": [
                    {
                        "uid": "6673fd6feb18f",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                2,
                                6
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "0e68d8ab-32db-40a6-8da0-7a626e2cf0a2",
                        "h": "ebfa41"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "61",
                "packet_type": "history",
                "move_id": "31",
                "time": "1718877552",
                "data": [
                    {
                        "uid": "6673fd6feb0de",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "ebfa41"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "63",
                "packet_type": "history",
                "move_id": "32",
                "time": "1718877949",
                "data": [
                    {
                        "uid": "6673fefdc356b",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "10d17a"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "64",
                "packet_type": "history",
                "move_id": "33",
                "time": "1718877990",
                "data": [
                    {
                        "uid": "6673ff265e363",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "8e2d0781-5edd-4247-8147-2983e94cad4d",
                        "h": "e870cf"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "65",
                "packet_type": "history",
                "move_id": "33",
                "time": "1718877990",
                "data": [
                    {
                        "uid": "6673ff265e21f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "e870cf"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "66",
                "packet_type": "history",
                "move_id": "34",
                "time": "1718877993",
                "data": [
                    {
                        "uid": "6673ff293efde",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                2
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "39754039-ef96-4c34-832e-476c73545102",
                        "h": "c80ad5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "67",
                "packet_type": "history",
                "move_id": "34",
                "time": "1718877993",
                "data": [
                    {
                        "uid": "6673ff293ee67",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "c80ad5"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "69",
                "packet_type": "history",
                "move_id": "35",
                "time": "1718878300",
                "data": [
                    {
                        "uid": "6674005c3e0ee",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "8d96bd"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "70",
                "packet_type": "history",
                "move_id": "36",
                "time": "1718880349",
                "data": [
                    {
                        "uid": "6674085d65ac0",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                1,
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "76edbd57-1b7e-4787-835f-915d7780575f",
                        "h": "70ad97"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "71",
                "packet_type": "history",
                "move_id": "36",
                "time": "1718880349",
                "data": [
                    {
                        "uid": "6674085d65a0c",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "70ad97"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "73",
                "packet_type": "history",
                "move_id": "37",
                "time": "1718882001",
                "data": [
                    {
                        "uid": "66740ed1bea1a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "3cc60f"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "74",
                "packet_type": "history",
                "move_id": "38",
                "time": "1718883607",
                "data": [
                    {
                        "uid": "667415179b149",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                7,
                                3
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "a5f80b33-776d-4cf5-8521-432fcc7987fc",
                        "h": "c9914f"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "75",
                "packet_type": "history",
                "move_id": "38",
                "time": "1718883607",
                "data": [
                    {
                        "uid": "667415179b078",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "c9914f"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "77",
                "packet_type": "history",
                "move_id": "39",
                "time": "1718885398",
                "data": [
                    {
                        "uid": "66741c160ea6a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "62bd74"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "78",
                "packet_type": "history",
                "move_id": "40",
                "time": "1718887491",
                "data": [
                    {
                        "uid": "66742443ac0ed",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                1
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "b8bbbd17-5a2a-45ba-8e50-ab1960df0ea9",
                        "h": "262d2e"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "79",
                "packet_type": "history",
                "move_id": "40",
                "time": "1718887491",
                "data": [
                    {
                        "uid": "66742443ac00f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "262d2e"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "81",
                "packet_type": "history",
                "move_id": "41",
                "time": "1718887523",
                "data": [
                    {
                        "uid": "66742463a34c8",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 2
                        },
                        "h": "f4ff97"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "82",
                "packet_type": "history",
                "move_id": "42",
                "time": "1718916425",
                "data": [
                    {
                        "uid": "66749549a622c",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "3465173a-6bde-4769-8912-b14dbd7d705f",
                        "h": "5c2e93"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "83",
                "packet_type": "history",
                "move_id": "42",
                "time": "1718916425",
                "data": [
                    {
                        "uid": "66749549a6166",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "5c2e93"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "84",
                "packet_type": "history",
                "move_id": "43",
                "time": "1718918520",
                "data": [
                    {
                        "uid": "66749d780a2cf",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 6
                        },
                        "h": "52dad1"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "85",
                "packet_type": "history",
                "move_id": "44",
                "time": "1718918523",
                "data": [
                    {
                        "uid": "66749d7b1c2f9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 6
                        },
                        "h": "ad49ed"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "86",
                "packet_type": "history",
                "move_id": "45",
                "time": "1718918956",
                "data": [
                    {
                        "uid": "66749f2c88d74",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "22b0068d-d683-4b91-8069-6a485c76eab5",
                        "h": "23f5f2"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "87",
                "packet_type": "history",
                "move_id": "45",
                "time": "1718918956",
                "data": [
                    {
                        "uid": "66749f2c88cb3",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "23f5f2"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "88",
                "packet_type": "history",
                "move_id": "46",
                "time": "1718918964",
                "data": [
                    {
                        "uid": "66749f3467ae2",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "c080459b-f77a-40cd-8323-0560af717710",
                        "h": "341175"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "89",
                "packet_type": "history",
                "move_id": "46",
                "time": "1718918964",
                "data": [
                    {
                        "uid": "66749f34679e5",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "341175"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "90",
                "packet_type": "history",
                "move_id": "47",
                "time": "1718919008",
                "data": [
                    {
                        "uid": "66749f60eb3f6",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 7
                        },
                        "h": "19096d"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "91",
                "packet_type": "history",
                "move_id": "48",
                "time": "1718919013",
                "data": [
                    {
                        "uid": "66749f65054a9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 2
                        },
                        "h": "0b7a32"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "92",
                "packet_type": "history",
                "move_id": "49",
                "time": "1718919052",
                "data": [
                    {
                        "uid": "66749f8ca294c",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "chooosen",
                            "color": 4
                        },
                        "h": "2a0852"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "93",
                "packet_type": "history",
                "move_id": "50",
                "time": "1718919067",
                "data": [
                    {
                        "uid": "66749f9b5795d",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "814cb2dc-2fdf-4150-807a-26fd670f7131",
                        "h": "0f840d"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "94",
                "packet_type": "history",
                "move_id": "50",
                "time": "1718919067",
                "data": [
                    {
                        "uid": "66749f9b5788f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "0f840d"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "95",
                "packet_type": "history",
                "move_id": "51",
                "time": "1718919246",
                "data": [
                    {
                        "uid": "6674a04e23805",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 3
                        },
                        "h": "ae8339"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "97",
                "packet_type": "history",
                "move_id": "52",
                "time": "1718919258",
                "data": [
                    {
                        "uid": "6674a05a0191f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "menettm",
                            "count": 1
                        },
                        "h": "082c10"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "98",
                "packet_type": "history",
                "move_id": "53",
                "time": "1718923731",
                "data": [
                    {
                        "uid": "6674b1d337416",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "0c30a13e-0ef4-4c5b-8aeb-f530456f67a2",
                        "h": "6d8bb3"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "99",
                "packet_type": "history",
                "move_id": "53",
                "time": "1718923731",
                "data": [
                    {
                        "uid": "6674b1d33736f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "6d8bb3"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "526683833",
                "packet_id": "100",
                "packet_type": "history",
                "move_id": "54",
                "time": "1718923735",
                "data": [
                    {
                        "uid": "6674b1d779ec8",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "1b387104-a8a1-42df-821b-c543aac27020",
                        "h": "c13c92"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "101",
                "packet_type": "history",
                "move_id": "54",
                "time": "1718923735",
                "data": [
                    {
                        "uid": "6674b1d779e1a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "c13c92"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "102",
                "packet_type": "history",
                "move_id": "55",
                "time": "1718923755",
                "data": [
                    {
                        "uid": "6674b1ebbb570",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 1
                        },
                        "h": "2f985f"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "103",
                "packet_type": "history",
                "move_id": "56",
                "time": "1718923760",
                "data": [
                    {
                        "uid": "6674b1f0240e3",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${color}",
                        "args": {
                            "player_name": "menettm",
                            "color": 1
                        },
                        "h": "40fdc1"
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "104",
                "packet_type": "history",
                "move_id": "57",
                "time": "1718923782",
                "data": [
                    {
                        "uid": "6674b20680a8f",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 15,
                            "route": {
                                "id": 42,
                                "from": 8,
                                "to": 33,
                                "number": 6,
                                "color": 1,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1041,
                                        "y": 321,
                                        "angle": -8,
                                        "top": false
                                    },
                                    {
                                        "x": 1105,
                                        "y": 310,
                                        "angle": -8,
                                        "top": false
                                    },
                                    {
                                        "x": 1170,
                                        "y": 298,
                                        "angle": -8,
                                        "top": false
                                    },
                                    {
                                        "x": 1235,
                                        "y": 288,
                                        "angle": -8,
                                        "top": false
                                    },
                                    {
                                        "x": 1298,
                                        "y": 277,
                                        "angle": -8,
                                        "top": false
                                    },
                                    {
                                        "x": 1364,
                                        "y": 265,
                                        "angle": -8,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Duluth",
                            "to": "Toronto",
                            "number": 6,
                            "colors": [
                                1,
                                1,
                                1,
                                1,
                                1,
                                0
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "105",
                "packet_type": "history",
                "move_id": "58",
                "time": "1718923806",
                "data": [
                    {
                        "uid": "6674b21e3ad77",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 15,
                            "route": {
                                "id": 96,
                                "from": 29,
                                "to": 36,
                                "number": 6,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 853,
                                        "y": 123,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 917,
                                        "y": 136,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 981,
                                        "y": 149,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 1044,
                                        "y": 163,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 1107,
                                        "y": 177,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 1171,
                                        "y": 189,
                                        "angle": 12,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Sault St. Marie",
                            "to": "Winnipeg",
                            "number": 6,
                            "colors": [
                                8,
                                8,
                                8,
                                8,
                                8,
                                8
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "106",
                "packet_type": "history",
                "move_id": "59",
                "time": "1718923939",
                "data": [
                    {
                        "uid": "6674b2a389f32",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 15,
                            "route": {
                                "id": 38,
                                "from": 8,
                                "to": 10,
                                "number": 6,
                                "color": 5,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 613,
                                        "y": 338,
                                        "angle": -1,
                                        "top": false
                                    },
                                    {
                                        "x": 679,
                                        "y": 338,
                                        "angle": -1,
                                        "top": false
                                    },
                                    {
                                        "x": 745,
                                        "y": 337,
                                        "angle": -1,
                                        "top": false
                                    },
                                    {
                                        "x": 810,
                                        "y": 336,
                                        "angle": -1,
                                        "top": false
                                    },
                                    {
                                        "x": 876,
                                        "y": 335,
                                        "angle": -1,
                                        "top": false
                                    },
                                    {
                                        "x": 942,
                                        "y": 334,
                                        "angle": -1,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Duluth",
                            "to": "Helena",
                            "number": 6,
                            "colors": [
                                5,
                                5,
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "107",
                "packet_type": "history",
                "move_id": "60",
                "time": "1718923970",
                "data": [
                    {
                        "uid": "6674b2c2082df",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 15,
                            "route": {
                                "id": 14,
                                "from": 3,
                                "to": 36,
                                "number": 6,
                                "color": 2,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 428,
                                        "y": 84,
                                        "angle": -23,
                                        "top": false
                                    },
                                    {
                                        "x": 490,
                                        "y": 65,
                                        "angle": -11,
                                        "top": false
                                    },
                                    {
                                        "x": 555,
                                        "y": 55,
                                        "angle": -2,
                                        "top": false
                                    },
                                    {
                                        "x": 622,
                                        "y": 56,
                                        "angle": 4,
                                        "top": false
                                    },
                                    {
                                        "x": 687,
                                        "y": 69,
                                        "angle": 15,
                                        "top": false
                                    },
                                    {
                                        "x": 747,
                                        "y": 91,
                                        "angle": 25,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Calgary",
                            "to": "Winnipeg",
                            "number": 6,
                            "colors": [
                                2,
                                2,
                                2,
                                2,
                                2,
                                2
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "108",
                "packet_type": "history",
                "move_id": "61",
                "time": "1718924135",
                "data": [
                    {
                        "uid": "6674b367230fe",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 15,
                            "route": {
                                "id": 51,
                                "from": 10,
                                "to": 32,
                                "number": 6,
                                "color": 4,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 186,
                                        "y": 263,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 250,
                                        "y": 278,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 313,
                                        "y": 292,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 377,
                                        "y": 307,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 440,
                                        "y": 321,
                                        "angle": 12,
                                        "top": false
                                    },
                                    {
                                        "x": 504,
                                        "y": 335,
                                        "angle": 12,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Helena",
                            "to": "Seattle",
                            "number": 6,
                            "colors": [
                                4,
                                4,
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "109",
                "packet_type": "history",
                "move_id": "62",
                "time": "1718924156",
                "data": [
                    {
                        "uid": "6674b37c04c7b",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 10,
                            "route": {
                                "id": 71,
                                "from": 17,
                                "to": 29,
                                "number": 5,
                                "color": 6,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1264,
                                        "y": 173,
                                        "angle": -40,
                                        "top": false
                                    },
                                    {
                                        "x": 1318,
                                        "y": 137,
                                        "angle": -28,
                                        "top": false
                                    },
                                    {
                                        "x": 1377,
                                        "y": 111,
                                        "angle": -19,
                                        "top": false
                                    },
                                    {
                                        "x": 1442,
                                        "y": 93,
                                        "angle": -13,
                                        "top": false
                                    },
                                    {
                                        "x": 1507,
                                        "y": 86,
                                        "angle": 0,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Montréal",
                            "to": "Sault St. Marie",
                            "number": 5,
                            "colors": [
                                6,
                                6,
                                6,
                                6,
                                6
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "110",
                "packet_type": "history",
                "move_id": "63",
                "time": "1718926132",
                "data": [
                    {
                        "uid": "6674bb34a67c2",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 7,
                            "route": {
                                "id": 12,
                                "from": 3,
                                "to": 32,
                                "number": 4,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 191,
                                        "y": 229,
                                        "angle": 0,
                                        "top": false
                                    },
                                    {
                                        "x": 257,
                                        "y": 225,
                                        "angle": -7,
                                        "top": false
                                    },
                                    {
                                        "x": 318,
                                        "y": 201,
                                        "angle": -37,
                                        "top": false
                                    },
                                    {
                                        "x": 361,
                                        "y": 149,
                                        "angle": -63,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Calgary",
                            "to": "Seattle",
                            "number": 4,
                            "colors": [
                                3,
                                3,
                                3,
                                3
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "111",
                "packet_type": "history",
                "move_id": "64",
                "time": "1718943134",
                "data": [
                    {
                        "uid": "6674fd9ebc417",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 7,
                            "route": {
                                "id": 100,
                                "from": 3,
                                "to": 10,
                                "number": 4,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 414,
                                        "y": 145,
                                        "angle": 50,
                                        "top": false
                                    },
                                    {
                                        "x": 457,
                                        "y": 196,
                                        "angle": 50,
                                        "top": false
                                    },
                                    {
                                        "x": 498,
                                        "y": 245,
                                        "angle": 50,
                                        "top": false
                                    },
                                    {
                                        "x": 540,
                                        "y": 295,
                                        "angle": 50,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Calgary",
                            "to": "Helena",
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "112",
                "packet_type": "history",
                "move_id": "65",
                "time": "1718959638",
                "data": [
                    {
                        "uid": "66753e1600b33",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
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
                                0,
                                0
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "113",
                "packet_type": "history",
                "move_id": "66",
                "time": "1718961057",
                "data": [
                    {
                        "uid": "667543a129bef",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 4,
                            "route": {
                                "id": 72,
                                "from": 17,
                                "to": 33,
                                "number": 3,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1426,
                                        "y": 202,
                                        "angle": -59,
                                        "top": false
                                    },
                                    {
                                        "x": 1468,
                                        "y": 151,
                                        "angle": -42,
                                        "top": false
                                    },
                                    {
                                        "x": 1524,
                                        "y": 115,
                                        "angle": -23,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Montréal",
                            "to": "Toronto",
                            "number": 3,
                            "colors": [
                                5,
                                5,
                                5
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "114",
                "packet_type": "history",
                "move_id": "67",
                "time": "1718962641",
                "data": [
                    {
                        "uid": "667549d149bd8",
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "115",
                "packet_type": "history",
                "move_id": "68",
                "time": "1718962987",
                "data": [
                    {
                        "uid": "66754b2bc9829",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 2,
                            "route": {
                                "id": 77,
                                "from": 20,
                                "to": 24,
                                "number": 2,
                                "color": 8,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1504,
                                        "y": 393,
                                        "angle": -31,
                                        "top": false
                                    },
                                    {
                                        "x": 1559,
                                        "y": 360,
                                        "angle": -31,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "New York",
                            "to": "Pittsburgh",
                            "number": 2,
                            "colors": [
                                0,
                                0
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "116",
                "packet_type": "history",
                "move_id": "69",
                "time": "1718963260",
                "data": [
                    {
                        "uid": "66754c3c02a6d",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 2,
                            "route": {
                                "id": 78,
                                "from": 20,
                                "to": 35,
                                "number": 2,
                                "color": 5,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1605,
                                        "y": 384,
                                        "angle": 87,
                                        "top": false
                                    },
                                    {
                                        "x": 1608,
                                        "y": 450,
                                        "angle": 87,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "New York",
                            "to": "Washington",
                            "number": 2,
                            "colors": [
                                5,
                                0
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "117",
                "packet_type": "history",
                "move_id": "70",
                "time": "1718963602",
                "data": [
                    {
                        "uid": "66754d91e7f77",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 2,
                            "route": {
                                "id": 85,
                                "from": 24,
                                "to": 35,
                                "number": 2,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1507,
                                        "y": 446,
                                        "angle": 28,
                                        "top": false
                                    },
                                    {
                                        "x": 1565,
                                        "y": 477,
                                        "angle": 28,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Pittsburgh",
                            "to": "Washington",
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "118",
                "packet_type": "history",
                "move_id": "71",
                "time": "1718963607",
                "data": [
                    {
                        "uid": "66754d97e2256",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
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
                                7,
                                7
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "119",
                "packet_type": "history",
                "move_id": "72",
                "time": "1718963633",
                "data": [
                    {
                        "uid": "66754db130682",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 2,
                            "route": {
                                "id": 82,
                                "from": 24,
                                "to": 26,
                                "number": 2,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1474,
                                        "y": 485,
                                        "angle": 77,
                                        "top": false
                                    },
                                    {
                                        "x": 1489,
                                        "y": 550,
                                        "angle": 77,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Pittsburgh",
                            "to": "Raleigh",
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
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "120",
                "packet_type": "history",
                "move_id": "73",
                "time": "1718963642",
                "data": [
                    {
                        "uid": "66754dba96629",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "chooosen",
                            "points": 4,
                            "route": {
                                "id": 74,
                                "from": 18,
                                "to": 26,
                                "number": 3,
                                "color": 6,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1342,
                                        "y": 631,
                                        "angle": -32,
                                        "top": false
                                    },
                                    {
                                        "x": 1402,
                                        "y": 606,
                                        "angle": -13,
                                        "top": false
                                    },
                                    {
                                        "x": 1468,
                                        "y": 600,
                                        "angle": 4,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Nashville",
                            "to": "Raleigh",
                            "number": 3,
                            "colors": [
                                6,
                                6,
                                6
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/table/t526683833",
                "table_id": "526683833",
                "packet_id": "121",
                "packet_type": "history",
                "move_id": "74",
                "time": "1718963769",
                "data": [
                    {
                        "uid": "66754e38e7265",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "menettm",
                            "points": 2,
                            "route": {
                                "id": 75,
                                "from": 18,
                                "to": 27,
                                "number": 2,
                                "color": 0,
                                "tunnel": false,
                                "locomotives": 0,
                                "spaces": [
                                    {
                                        "x": 1178,
                                        "y": 631,
                                        "angle": 17,
                                        "top": false
                                    },
                                    {
                                        "x": 1240,
                                        "y": 651,
                                        "angle": 17,
                                        "top": false
                                    }
                                ]
                            },
                            "from": "Nashville",
                            "to": "Saint Louis",
                            "number": 2,
                            "colors": [
                                3,
                                0
                            ]
                        }
                    }
                ]
            }
        ]
    }
};

main(ChatHistory);
