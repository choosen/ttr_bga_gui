// Define PacketData as a Record in JS
const PacketData = (channel, packet_type, move_id, time, data, table_id) => ({
    channel,
    packet_type,
    move_id,
    time,
    data,
    table_id,
});

// MY_NAME constant
const MY_NAME = Object.freeze("chooosen");

// COLORS_MAPPING and NUMBER_TO_COLORS_MAPPING
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

// BasePacket class
class BasePacket {
    #packet_data;

    constructor(hash) {
        const { packet_id, ...rest } = hash;
        // console.dir(rest);
        this.#packet_data = PacketData(...Object.values(rest));
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

// ClaimedRoute class
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

// TrainCarPicked class
class TrainCarPicked extends BasePacket {
    call(state) {
        console.dir(this.data);
        console.dir(this.packet_data);
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
            state.enemy_take_card();
        }

        state.enemy_take_card();
    }
}

// SimpleNote class
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
}

// PacketFactory module
const PacketFactory = {
    create(hash) {
        switch (true) {
            case Array.isArray(hash.data) && hash.data.length >= 2 && hash.data[1]?.type === "highlightVisibleLocomotives": {
                const move_type = hash.data[0].type;
                return new PacketClasses[move_type](hash);
            }

            case Array.isArray(hash.data) && hash.data.length > 2:
                throw new Error(`We do not support multiple data other than highlightVisibleLocomotives in packet ${JSON.stringify(hash)}`);

            case Array.isArray(hash.data) && hash.data.length === 1: {
                const move_type = hash.data[0].type;
                return new PacketClasses[move_type](hash);
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

// State class
class State {
    static parse_js() {
        // TODO: get formatted data from Window
        const data = {
            "visible_cards": {
                "0": 1,
                "1": 1,
                "3": 1,
                "4": 1,
                "5": 1
            },
            "start_setup": {
                "0": 4,
                "1": 5,
                "2": 3,
                "3": 2,
                "4": 7,
                "5": 5,
                "6": 5,
                "7": 5,
                "8": 6
            },
            "player_stats": [
                {
                    "id": "89487798",
                    "remainingTrainCarsCount": 44,
                    "name": "Fredij",
                    "trainCarsCount": 41,
                    "claimedRoutes": [
                        "Atlanta",
                        "Nashville"
                    ]
                },
                {
                    "id": "95232426",
                    "remainingTrainCarsCount": 45,
                    "name": "chooosen",
                    "trainCarsCount": 42,
                    "claimedRoutes": []
                }
            ]
        };

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


// TODO: take input from ChatHistory response
const input = {
    "status": 1,
    "data": {
        "valid": 1,
        "data": [
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "4",
                "packet_type": "history",
                "move_id": "2",
                "time": "1719305209",
                "data": [
                    {
                        "uid": "667a83f9b9477",
                        "type": "destinationsPicked",
                        "log": "${player_name} keeps ${count} destinations",
                        "args": {
                            "player_name": "Fredij",
                            "count": 2
                        },
                        "h": "11cc8e"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "5",
                "packet_type": "history",
                "move_id": "3",
                "time": "1719319909",
                "data": [
                    {
                        "uid": "667abd65d6c9e",
                        "type": "destinationsPicked",
                        "log": "${player_name} keeps ${count} destinations",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "6ab76a"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "7",
                "packet_type": "history",
                "move_id": "4",
                "time": "1719325288",
                "data": [
                    {
                        "uid": "667ad268dc888",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "97d349"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "9",
                "packet_type": "history",
                "move_id": "5",
                "time": "1719325290",
                "data": [
                    {
                        "uid": "667ad26aa8ab5",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "75b408"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "10",
                "packet_type": "history",
                "move_id": "6",
                "time": "1719326704",
                "data": [
                    {
                        "uid": "667ad7f022f61",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                1,
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "7da2cf59-64f8-4550-8b22-bbc4656cb3f5",
                        "h": "7af7c0"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "11",
                "packet_type": "history",
                "move_id": "6",
                "time": "1719326704",
                "data": [
                    {
                        "uid": "667ad7f022ebe",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "7af7c0"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "13",
                "packet_type": "history",
                "move_id": "7",
                "time": "1719326742",
                "data": [
                    {
                        "uid": "667ad81616664",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "79bd81"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "15",
                "packet_type": "history",
                "move_id": "8",
                "time": "1719326743",
                "data": [
                    {
                        "uid": "667ad817ba81f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "216511"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "16",
                "packet_type": "history",
                "move_id": "9",
                "time": "1719326764",
                "data": [
                    {
                        "uid": "667ad82c04bf4",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6,
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "2ad2b1cc-aa99-4840-8a3c-d374ea4320f5",
                        "h": "6ba709"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "17",
                "packet_type": "history",
                "move_id": "9",
                "time": "1719326764",
                "data": [
                    {
                        "uid": "667ad82c04ade",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "6ba709"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "19",
                "packet_type": "history",
                "move_id": "10",
                "time": "1719328820",
                "data": [
                    {
                        "uid": "667ae0347b1d7",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "32d706"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "21",
                "packet_type": "history",
                "move_id": "11",
                "time": "1719328822",
                "data": [
                    {
                        "uid": "667ae03635b1c",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "2adc40"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "22",
                "packet_type": "history",
                "move_id": "12",
                "time": "1719334196",
                "data": [
                    {
                        "uid": "667af53463768",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                0,
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "7111b98d-ff2d-4331-847c-4ad4b452f35e",
                        "h": "db093d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "23",
                "packet_type": "history",
                "move_id": "12",
                "time": "1719334196",
                "data": [
                    {
                        "uid": "667af53463698",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "db093d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "25",
                "packet_type": "history",
                "move_id": "13",
                "time": "1719348138",
                "data": [
                    {
                        "uid": "667b2baaa0703",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "748153"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "27",
                "packet_type": "history",
                "move_id": "14",
                "time": "1719348140",
                "data": [
                    {
                        "uid": "667b2bac8b6be",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "22e663"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "28",
                "packet_type": "history",
                "move_id": "15",
                "time": "1719348747",
                "data": [
                    {
                        "uid": "667b2e0b9dbe5",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                3,
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "af6ff645-1eb2-42cd-82dc-0ca68eeebce5",
                        "h": "aefe8f"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "29",
                "packet_type": "history",
                "move_id": "15",
                "time": "1719348747",
                "data": [
                    {
                        "uid": "667b2e0b9dafa",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "aefe8f"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "31",
                "packet_type": "history",
                "move_id": "16",
                "time": "1719351494",
                "data": [
                    {
                        "uid": "667b38c637afc",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "a52cd3"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "33",
                "packet_type": "history",
                "move_id": "17",
                "time": "1719351496",
                "data": [
                    {
                        "uid": "667b38c7f0b71",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "a0dcb6"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "34",
                "packet_type": "history",
                "move_id": "18",
                "time": "1719383236",
                "data": [
                    {
                        "uid": "667bb4c466392",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "04151dd4-23a3-47c5-81bb-1af20b7f2feb",
                        "h": "cf5587"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "35",
                "packet_type": "history",
                "move_id": "18",
                "time": "1719383236",
                "data": [
                    {
                        "uid": "667bb4c4662e0",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "cf5587"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "36",
                "packet_type": "history",
                "move_id": "19",
                "time": "1719383238",
                "data": [
                    {
                        "uid": "667bb4c67c29f",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "6524d23a-8e56-4b6e-8f2e-3189a509c399",
                        "h": "e23e85"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "37",
                "packet_type": "history",
                "move_id": "19",
                "time": "1719383238",
                "data": [
                    {
                        "uid": "667bb4c67c1e6",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "e23e85"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "39",
                "packet_type": "history",
                "move_id": "20",
                "time": "1719384275",
                "data": [
                    {
                        "uid": "667bb8d2ee437",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "4b7ea5"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "41",
                "packet_type": "history",
                "move_id": "21",
                "time": "1719384277",
                "data": [
                    {
                        "uid": "667bb8d4d90d7",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "4ebdc5"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "42",
                "packet_type": "history",
                "move_id": "22",
                "time": "1719384343",
                "data": [
                    {
                        "uid": "667bb917a1029",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "b9c524ff-e4d7-4778-8bd3-61350ad212e2",
                        "h": "5f1c2d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "43",
                "packet_type": "history",
                "move_id": "22",
                "time": "1719384343",
                "data": [
                    {
                        "uid": "667bb917a0edd",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "5f1c2d"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "44",
                "packet_type": "history",
                "move_id": "23",
                "time": "1719384346",
                "data": [
                    {
                        "uid": "667bb91a4ee98",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                2
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "b4d0f4cd-6a08-416a-8b7c-e46670a05e77",
                        "h": "512e4c"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "45",
                "packet_type": "history",
                "move_id": "23",
                "time": "1719384346",
                "data": [
                    {
                        "uid": "667bb91a4edf0",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 1
                        },
                        "h": "512e4c"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "47",
                "packet_type": "history",
                "move_id": "24",
                "time": "1719384794",
                "data": [
                    {
                        "uid": "667bbadad1f5d",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "c71c4b"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "49",
                "packet_type": "history",
                "move_id": "25",
                "time": "1719384797",
                "data": [
                    {
                        "uid": "667bbadcdc65f",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "65f037"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "50",
                "packet_type": "history",
                "move_id": "26",
                "time": "1719384984",
                "data": [
                    {
                        "uid": "667bbb98bebc5",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6,
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "39cd0cfc-0ca2-42d6-892e-73188b8c167c",
                        "h": "45cb3b"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "51",
                "packet_type": "history",
                "move_id": "26",
                "time": "1719384984",
                "data": [
                    {
                        "uid": "667bbb98beafb",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "45cb3b"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "53",
                "packet_type": "history",
                "move_id": "27",
                "time": "1719385096",
                "data": [
                    {
                        "uid": "667bbc088fd14",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "f2b2f9"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "55",
                "packet_type": "history",
                "move_id": "28",
                "time": "1719385098",
                "data": [
                    {
                        "uid": "667bbc0a81546",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "ec0a3e"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "56",
                "packet_type": "history",
                "move_id": "29",
                "time": "1719385217",
                "data": [
                    {
                        "uid": "667bbc812a704",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                8,
                                1
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "438af4ac-61a6-47bd-8883-8d95b0390072",
                        "h": "bbcf26"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "57",
                "packet_type": "history",
                "move_id": "29",
                "time": "1719385217",
                "data": [
                    {
                        "uid": "667bbc8129cd2",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "bbcf26"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "59",
                "packet_type": "history",
                "move_id": "30",
                "time": "1719385370",
                "data": [
                    {
                        "uid": "667bbd1a164f3",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "094adb"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "61",
                "packet_type": "history",
                "move_id": "31",
                "time": "1719385371",
                "data": [
                    {
                        "uid": "667bbd1ba96b2",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "ff10eb"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "62",
                "packet_type": "history",
                "move_id": "32",
                "time": "1719385690",
                "data": [
                    {
                        "uid": "667bbe5a9eb9e",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                1,
                                1
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "5cee9620-9199-4cdc-8d0a-5d204157f11b",
                        "h": "f3b7e0"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "63",
                "packet_type": "history",
                "move_id": "32",
                "time": "1719385690",
                "data": [
                    {
                        "uid": "667bbe5a9eafb",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "f3b7e0"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "65",
                "packet_type": "history",
                "move_id": "33",
                "time": "1719389688",
                "data": [
                    {
                        "uid": "667bcdf871337",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "e6a3c1"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "67",
                "packet_type": "history",
                "move_id": "34",
                "time": "1719389690",
                "data": [
                    {
                        "uid": "667bcdfa82c4a",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "417a76"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "68",
                "packet_type": "history",
                "move_id": "35",
                "time": "1719390105",
                "data": [
                    {
                        "uid": "667bcf99e5e61",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6,
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "8b0e16d2-c8e9-4209-842e-dd2fe52a7df3",
                        "h": "5e5329"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "69",
                "packet_type": "history",
                "move_id": "35",
                "time": "1719390106",
                "data": [
                    {
                        "uid": "667bcf99e5dbf",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "5e5329"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "71",
                "packet_type": "history",
                "move_id": "36",
                "time": "1719390883",
                "data": [
                    {
                        "uid": "667bd2a3af9e9",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "ddf507"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "73",
                "packet_type": "history",
                "move_id": "37",
                "time": "1719390886",
                "data": [
                    {
                        "uid": "667bd2a5ee5c7",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "8bcbbf"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "74",
                "packet_type": "history",
                "move_id": "38",
                "time": "1719390901",
                "data": [
                    {
                        "uid": "667bd2b5c49c2",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                6,
                                5
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "0015292d-24b9-4bbe-8682-290422faad41",
                        "h": "90ece2"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "75",
                "packet_type": "history",
                "move_id": "38",
                "time": "1719390901",
                "data": [
                    {
                        "uid": "667bd2b5c48eb",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "90ece2"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "77",
                "packet_type": "history",
                "move_id": "39",
                "time": "1719390958",
                "data": [
                    {
                        "uid": "667bd2ee16154",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "3b084a"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "79",
                "packet_type": "history",
                "move_id": "40",
                "time": "1719390960",
                "data": [
                    {
                        "uid": "667bd2f02ae27",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "4c2a8c"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "80",
                "packet_type": "history",
                "move_id": "41",
                "time": "1719391016",
                "data": [
                    {
                        "uid": "667bd32862118",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "2cd22c21-d6f7-4d00-87cf-3c5bfd4719f8",
                        "h": "9a3ce1"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "81",
                "packet_type": "history",
                "move_id": "41",
                "time": "1719391016",
                "data": [
                    {
                        "uid": "667bd32862076",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "9a3ce1"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "83",
                "packet_type": "history",
                "move_id": "42",
                "time": "1719391716",
                "data": [
                    {
                        "uid": "667bd5e423416",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "ab012b"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "85",
                "packet_type": "history",
                "move_id": "43",
                "time": "1719391717",
                "data": [
                    {
                        "uid": "667bd5e5b7357",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "c10d8a"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "86",
                "packet_type": "history",
                "move_id": "44",
                "time": "1719391743",
                "data": [
                    {
                        "uid": "667bd5ff616f2",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                3,
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "10f29a83-96c4-4e53-84c3-e14566f793a9",
                        "h": "3c3799"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "87",
                "packet_type": "history",
                "move_id": "44",
                "time": "1719391743",
                "data": [
                    {
                        "uid": "667bd5ff61650",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "3c3799"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "89",
                "packet_type": "history",
                "move_id": "45",
                "time": "1719394552",
                "data": [
                    {
                        "uid": "667be0f8b9e68",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "38c479"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "91",
                "packet_type": "history",
                "move_id": "46",
                "time": "1719394554",
                "data": [
                    {
                        "uid": "667be0fa5b661",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "14db4c"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "92",
                "packet_type": "history",
                "move_id": "47",
                "time": "1719395027",
                "data": [
                    {
                        "uid": "667be2d3a5873",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "beeb5e61-86b9-408b-88a1-f5210808e04c",
                        "h": "f6c551"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "93",
                "packet_type": "history",
                "move_id": "47",
                "time": "1719395027",
                "data": [
                    {
                        "uid": "667be2d3a57d1",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "f6c551"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "95",
                "packet_type": "history",
                "move_id": "48",
                "time": "1719396227",
                "data": [
                    {
                        "uid": "667be7830be81",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "01a431"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "97",
                "packet_type": "history",
                "move_id": "49",
                "time": "1719396229",
                "data": [
                    {
                        "uid": "667be7852f0da",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "049252"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "98",
                "packet_type": "history",
                "move_id": "50",
                "time": "1719396397",
                "data": [
                    {
                        "uid": "667be82d95a3e",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5,
                                4
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "51b31717-1583-4095-8a82-8ebdb55d9d74",
                        "h": "4d4b3d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "99",
                "packet_type": "history",
                "move_id": "50",
                "time": "1719396397",
                "data": [
                    {
                        "uid": "667be82d95987",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "4d4b3d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "101",
                "packet_type": "history",
                "move_id": "51",
                "time": "1719396409",
                "data": [
                    {
                        "uid": "667be839d5f40",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "f8714c"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "103",
                "packet_type": "history",
                "move_id": "52",
                "time": "1719396412",
                "data": [
                    {
                        "uid": "667be83c2d975",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "4d0c26"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "104",
                "packet_type": "history",
                "move_id": "53",
                "time": "1719396413",
                "data": [
                    {
                        "uid": "667be83d6f195",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                5,
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "98d9f449-5944-4533-83ad-c464707919b5",
                        "h": "93e43e"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "105",
                "packet_type": "history",
                "move_id": "53",
                "time": "1719396413",
                "data": [
                    {
                        "uid": "667be83d6f0d5",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "93e43e"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "107",
                "packet_type": "history",
                "move_id": "54",
                "time": "1719396461",
                "data": [
                    {
                        "uid": "667be86da56aa",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "6a4371"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "109",
                "packet_type": "history",
                "move_id": "55",
                "time": "1719396464",
                "data": [
                    {
                        "uid": "667be8700b368",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "fcd223"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "110",
                "packet_type": "history",
                "move_id": "56",
                "time": "1719396506",
                "data": [
                    {
                        "uid": "667be89a42769",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                8
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "a69071f2-908a-456d-8526-5d86570f2465",
                        "h": "5d4ef4"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "111",
                "packet_type": "history",
                "move_id": "56",
                "time": "1719396506",
                "data": [
                    {
                        "uid": "667be89a42610",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "5d4ef4"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "113",
                "packet_type": "history",
                "move_id": "57",
                "time": "1719397138",
                "data": [
                    {
                        "uid": "667beb122611d",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "701fdc"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "115",
                "packet_type": "history",
                "move_id": "58",
                "time": "1719397139",
                "data": [
                    {
                        "uid": "667beb13d83dc",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "13f550"
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "116",
                "packet_type": "history",
                "move_id": "59",
                "time": "1719397818",
                "data": [
                    {
                        "uid": "667bedbac2ad5",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                8,
                                7
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "a909e4dd-ab0b-486e-88a2-839538f2bab6",
                        "h": "e7c5e5"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "117",
                "packet_type": "history",
                "move_id": "59",
                "time": "1719397818",
                "data": [
                    {
                        "uid": "667bedbac29a3",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "e7c5e5"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "118",
                "packet_type": "history",
                "move_id": "60",
                "time": "1719398218",
                "data": [
                    {
                        "uid": "667bef4ad0f33",
                        "type": "claimedRoute",
                        "log": "${player_name} gains ${points} point(s) by claiming route from ${from} to ${to} with ${number} train car(s) : ${colors}",
                        "args": {
                            "player_name": "Fredij",
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
                                2
                            ]
                        }
                    }
                ]
            },
            {
                "channel": "/player/p95232426",
                "table_id": "529548060",
                "packet_id": "119",
                "packet_type": "history",
                "move_id": "61",
                "time": "1719401256",
                "data": [
                    {
                        "uid": "667bfb27e9620",
                        "type": "trainCarPicked",
                        "log": "You take hidden train car card(s) ${colors}",
                        "args": {
                            "colors": [
                                4,
                                0
                            ]
                        },
                        "synchro": 1,
                        "lock_uuid": "9f597a1f-6a45-4ea4-8bc5-cf7d6cd9da9a",
                        "h": "40d77d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "120",
                "packet_type": "history",
                "move_id": "61",
                "time": "1719401256",
                "data": [
                    {
                        "uid": "667bfb27e9573",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "chooosen",
                            "count": 2
                        },
                        "h": "40d77d"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "122",
                "packet_type": "history",
                "move_id": "62",
                "time": "1719403004",
                "data": [
                    {
                        "uid": "667c01fc3ceea",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "ac98e2"
                    }
                ]
            },
            {
                "channel": "/table/t529548060",
                "table_id": "529548060",
                "packet_id": "124",
                "packet_type": "history",
                "move_id": "63",
                "time": "1719403008",
                "data": [
                    {
                        "uid": "667c02001acaa",
                        "type": "trainCarPicked",
                        "log": "${player_name} takes ${count} hidden train car card(s)",
                        "args": {
                            "player_name": "Fredij",
                            "count": 1
                        },
                        "h": "b90321"
                    }
                ]
            }
        ]
    }
};

// Main function equivalent
function main(input) {
    const DECK_CARDS_NO = 110;


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
        console.log(`enemy is ${packets.find(packet => !packet.me()).player}`);
        console.log(`Game/Table id is ${packets[0].table_id}`);
        console.log(`Game started by ${ready_packets?.[0]?.player || "//waiting for first move"}`);
        state.export_enemy_moves_excel();
    }
}

main();
