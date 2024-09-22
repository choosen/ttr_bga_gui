require_relative "stateInitializer"

class State
  extend StateInitializer

  def initialize(visible_cards, start_setup, my_left_trains:, enemy_left_trains:,
    my_left_cards: nil, enemy_left_cards: nil)
    @visible_cards = visible_cards
    @my_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @start_setup = start_setup
    @start_setup.each { |color, number| my_cards[color] = number }
    @my_used_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @enemy_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @enemy_cards[:Unknown] = 4
    @enemy_used_cards = COLORS_MAPPING.keys.zip([0] * COLORS_MAPPING.keys.length).to_h
    @enemy_left_trains = enemy_left_trains
    @my_left_trains = my_left_trains
    @my_left_cards = my_left_cards
    @enemy_left_cards = enemy_left_cards
  end

  def enemy_take_card(color: :Unknown)
    enemy_cards[color] += 1
    # p enemy_cards
  end

  def my_take_card(color:)
    my_cards[color] += 1
    # p my_cards
  end

  def my_card_use(color:, length:, locomotives: 0)
    color_length = length - locomotives
    my_used_cards[color] += color_length
    my_cards[color] -= color_length
    my_used_cards[:Locomotive] += locomotives
    my_cards[:Locomotive] -= locomotives
  end

  def enemy_card_use(color:, length:, locomotives: 0)
    color_length = length - locomotives

    enemy_used_cards[color] += color_length
    enemy_used_cards[:Locomotive] += locomotives

    color_card_known = [enemy_cards[color], color_length].min
    locomotives_known = [enemy_cards[:Locomotive], locomotives].min
    enemy_cards[color] -= color_card_known
    enemy_cards[:Locomotive] -= locomotives_known
    enemy_cards[:Unknown] -= length - color_card_known - locomotives_known
    # p enemy_cards, enemy_used_cards
  end

  def output_current_state
    pp self
    puts "Verify: My Cards in hand (#{my_cards_with_js_load_fix.values.sum}): #{my_cards_with_js_load_fix}"
    puts "Verify: Enemy Cards in hand: #{enemy_cards.values.sum}"
  end

  def valid?
    puts "Verify: My Cards used: #{my_used_cards_number}"
    puts "Verify: Enemy Cards used: #{enemy_used_cards.values.sum}"
    valid_card_trains_and_used_cards =
      45 * 2 - (my_left_trains + enemy_left_trains) == my_used_cards_number + enemy_used_cards.values.sum
    if valid_enemy_cards_number? && valid_card_trains_and_used_cards
      puts "All Valid, based on number of trains and log"
      true
    else
      puts "ERROR, based on number of trains and log"
      false
    end
  end

  # maybe I had to read data IN JS from gameui.trainCarCardCounters  instead of gameui.gamedatas ?!

  # algorithm: based on enemy moves find out where the JSON UI state is and skip validation there,
  # just continue with history

  # IDEA: check where we are with history.log and if it is not synced to the end with JS state then:
  # mark current state as setup_state for me
  # do validate my cards with UI state (sometimes 1 move has to be ahead, if exported the state after my move)
  # update progress on based on remaining history to me
  # notify that it was based on outdated data, so please confirm calculated state!

  def valid_enemy_cards_number?
    unless enemy_left_cards
      puts "Skipping validate as no state from JS"
      return true
    end

    if enemy_left_cards == enemy_cards.values.sum
      puts "Valid JS state of game with sync of history actions"
      true
    else
      puts "Invalid JS state of game with sync of history actions"
    end
  end

  def export_to_excel
    COLORS_MAPPING.each_key.map do |color|
      row = [
        (my_used_cards[color] + enemy_used_cards[color]).then(&method(:replace_zero_with_empty_string)),
        my_cards_with_js_load_fix[color].then(&method(:replace_zero_with_empty_string)),
        enemy_cards[color].then(&method(:replace_zero_with_empty_string)),
        visible_cards[color].then(&method(:replace_zero_with_empty_string)) || ""
      ]
      row.join("\t")
    end.join "\n"
  end

  def export_enemy_moves_excel
    enemy_moves = COLORS_MAPPING.each_key.map do |color|
      enemy_used_cards[color].then(&method(:replace_zero_with_empty_string))
    end
    return puts "> No visible cards from user <" if enemy_moves.all? { |value| value == "" }

    puts "Enemy moves:"
    puts enemy_moves.join "\n"
    # todo: My card visible to enemy
  end

  private

  attr_reader :enemy_cards, :enemy_used_cards, :enemy_left_trains,
    :my_left_trains, :my_cards, :my_used_cards,
    :start_setup, :visible_cards, :my_left_cards, :enemy_left_cards

  def my_used_cards_number
    my_used_cards.values.sum
  end

  def my_cards_with_js_load_fix
    if start_setup.values.sum == 4
      my_cards
    else
      start_setup # start setup is current state also
    end
  end
  # initial_cards_number = start_setup.values.sum + my_used_cards.values.sum # valid only if state was collected with notification history
  # stan_obecny = stan poczatkowy + dodane_karty - uzyte karty
  # stan poczatkowy = stan_obecny - dodane_karty + uzyte karty
  # tylko nadal nie wiemy czy stan obecny jest z JS zawsze, wykrywanie tego moze byc trudne

  def replace_zero_with_empty_string(value)
    (value == 0) ? "" : value
  end
end
