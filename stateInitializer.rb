require 'json'

COLORS_MAPPING = {
  Locomotive: 0,
  Pink: 1,
  White: 2,
  Blue: 3,
  Yellow: 4,
  Orange: 5,
  Black: 6,
  Red: 7,
  Green: 8,
}.freeze
NUMBER_TO_COLORS_MAPPING = COLORS_MAPPING.invert

module StateInitializer
  def build
    visible_cards = {
      # Locomotive: 2,
      # Blue: 1,
      Black: 1,
      Red: 2,
      # Orange: 1,
      Yellow: 1,
      # Green: 2,
      # White: 1,
      Pink: 1
    }

    start_setup = { Yellow: 1, Orange: 1, Green: 1, Locomotive: 1 }
    my_left_trains = 3
    enemy_left_trains = 8

    new(visible_cards, start_setup, my_left_trains:, enemy_left_trains:)
  end

  def parse_js
    js_content = <<~JSON
    {
      "visible_cards": {
          "0": 2,
          "5": 1,
          "6": 2
      },
      "start_setup": {
          "0": 3,
          "1": 5,
          "2": 5,
          "5": 7,
          "7": 4
      },
      "player_stats": [
          {
              "id": "94349540",
              "remainingTrainCarsCount": 15,
              "name": "Jeroenpenguina",
              "trainCarsCount": 14,
              "claimedRoutes": [
                  "Chicago",
                  "Omaha",
                  "Denver",
                  "Phoenix",
                  "El Paso",
                  "Houston",
                  "Helena",
                  "Seattle"
              ]
          },
          {
              "id": "95232426",
              "remainingTrainCarsCount": 25,
              "name": "chooosen",
              "trainCarsCount": 24,
              "claimedRoutes": [
                  "Calgary",
                  "Seattle",
                  "El Paso",
                  "Los Angeles",
                  "San Francisco",
                  "Portland",
                  "Salt Lake City"
              ]
          }
      ]
  }
    JSON
    JSON.parse(js_content).deep_symbolize_keys => { visible_cards:, start_setup:, player_stats: }

    my_stats, other_stats = player_stats.partition { |stat| stat[:name] == MY_NAME }
    p player_stats
    my_left_trains = my_stats[0].fetch(:remainingTrainCarsCount)
    enemy_left_trains = other_stats[0].fetch(:remainingTrainCarsCount)
    puts 'Enemy owned destinations:'
    puts other_stats[0].fetch(:claimedRoutes).join("\n") # consume it, or just print it? :D
    puts
    visible_cards.transform_keys! { |key| NUMBER_TO_COLORS_MAPPING.fetch(key.to_s.to_i) }
    start_setup.transform_keys! { |key| NUMBER_TO_COLORS_MAPPING.fetch(key.to_s.to_i) }
    new(visible_cards, start_setup, my_left_trains:, enemy_left_trains:)
  end
end