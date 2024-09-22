require "json"

COLORS_MAPPING = {
  Locomotive: 0,
  Pink: 1,
  White: 2,
  Blue: 3,
  Yellow: 4,
  Orange: 5,
  Black: 6,
  Red: 7,
  Green: 8
}.freeze
NUMBER_TO_COLORS_MAPPING = COLORS_MAPPING.invert

module StateInitializer
  def build
    visible_cards = {
      Locomotive: 2,
      # Blue: 1,
      Black: 2,
      # Red: 1,
      Orange: 1
      # Yellow: 1,
      # Green: 2,
      # White: 2,
      # Pink: 1
    }

    start_setup = {Blue: 2, Orange: 1, Locomotive: 1}
    my_left_trains = 36
    enemy_left_trains = 30

    new(visible_cards, start_setup, my_left_trains:, enemy_left_trains:)
  end

  def parse_js
    JSON.load_file("game_ui_data.json").deep_symbolize_keys =>
      { visible_cards:, start_setup:, player_stats: }

    my_stats, other_stats = player_stats.partition { |stat| stat[:name] == MY_NAME }
    ap player_stats
    my_left_trains = my_stats[0].fetch(:remainingTrainCarsCount)
    my_left_cards = my_stats[0].fetch(:trainCarsCount)
    enemy_left_trains = other_stats[0].fetch(:remainingTrainCarsCount)
    enemy_left_cards = other_stats[0].fetch(:trainCarsCount)
    puts "Enemy owned destinations:"
    puts other_stats[0].fetch(:claimedRoutes).join("\n") # consume it, or just print it? :D
    puts
    visible_cards.transform_keys! { |key| NUMBER_TO_COLORS_MAPPING.fetch(key.to_s.to_i) }
    start_setup.transform_keys! { |key| NUMBER_TO_COLORS_MAPPING.fetch(key.to_s.to_i) }
    params = {my_left_trains:, enemy_left_trains:, my_left_cards:, enemy_left_cards:}
    ap(params.merge({visible_cards:, start_setup:}))
    new(visible_cards, start_setup, **params)
  end
end
