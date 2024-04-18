DECK_CARDS_NO = 110
COLORS_MAPPING = {
    Locomotive: 0,
    Blue: 3,
    Black: 6,
    Red: 7,
    Orange: 5,
    Yellow: 4,
    Green: 8,
    White: 2,
    Pink: 1,
}.freeze
NUMBER_TO_COLORS_MAPPING = COLORS_MAPPING.invert

class State
  def initialize(visible_cards, start_setup, my_left_trains: , enemy_left_trains:)
    @visible_cards = visible_cards
    @my_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    start_setup.each { |color, number| my_cards[color] = number }
    @my_used_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h

    @enemy_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @enemy_cards[:Unknown] = 0
    @enemy_used_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @enemy_left_trains = enemy_left_trains
    @my_left_trains = my_left_trains
  end

  def enemy_take_card(color: :Unknown)
    enemy_cards[color] += 1
  end

  def my_take_card(color:)
    my_cards[color] += 1
    p my_cards
  end

  def my_card_use(color:, length:, locomotives: 0)
    color_length = length - locomotives
    my_used_cards[color] += color_length
    my_cards[color] -= color_length
    my_used_cards[:Locomotive] += locomotives
  end

  def enemy_card_use(color:, length:, locomotives: 0)
    color_length = length - locomotives
    enemy_used_cards[color] += color_length
    color_value_before = enemy_cards[color]
    enemy_cards[color] = enemy_cards[color] > color_length ? enemy_cards[color] - color_length : 0
    enemy_cards[:Unknown] -= color_length - color_value_before
    enemy_used_cards[:Locomotive] += locomotives
  end

  def output_current_state
    p self
    puts "My Cards used: #{my_used_cards.values.sum}"
    puts "My Cards in hand: #{my_cards.values.sum}"
    puts "Enemy Cards used: #{enemy_used_cards.values.sum}"
    puts "Enemy Cards in hand: #{enemy_cards.values.sum}"
  end

  private

  attr_reader :enemy_cards, :enemy_used_cards,  :enemy_used_cards,  :enemy_left_trains,  :my_left_trains, :my_cards, :my_used_cards
end
