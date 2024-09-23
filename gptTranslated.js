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
        const color = this.data?.args?.color;

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
            visible_cards: { "0": 1, "1": 1, "3": 1, "4": 1, "5": 1 },
            start_setup: { "0": 4, "1": 5, "2": 3, "3": 2, "4": 7, "5": 5, "6": 5, "7": 5, "8": 6 },
            player_stats: [
                { id: "89487798", remainingTrainCarsCount: 44, name: "Fredij", trainCarsCount: 41, claimedRoutes: ["Atlanta", "Nashville"] },
                { id: "95232426", remainingTrainCarsCount: 45, name: "chooosen", trainCarsCount: 42, claimedRoutes: [] }
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

// Main function equivalent
function main() {
    const DECK_CARDS_NO = 110;

    // TODO: take input from ChatHistory response
    const input = {
        status: 1,
        data: {
            valid: 1,
            data: [
                { channel: "/table/t529548060", table_id: "529548060", packet_id: "4", packet_type: "history", move_id: "2", time: "1719305209", data: [{ uid: "667a83f9b9477", type: "destinationsPicked", log: "${player_name} keeps ${count} destinations", args: { player_name: "Fredij", count: 2 }, h: "11cc8e" }] },
                { channel: "/table/t529548060", table_id: "529548060", packet_id: "5", packet_type: "history", move_id: "3", time: "1719319909", data: [{ uid: "667abd65d6c9e", type: "destinationsPicked", log: "${player_name} keeps ${count} destinations", args: { player_name: "chooosen", count: 2 }, h: "6ab76a" }] }
            ]
        }
    };

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
