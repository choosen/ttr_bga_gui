require_relative 'state'

# types of history entries:

#  h.dig(:data,:data).map { |m| m[:data][0][:type] }.uniq
#     [0] "simpleNote",               /////////// to ignore
#     [1] "destinationsPicked",     //////// not useful to spreadsheet
#     [2] "claimedRoute",
#     [3] "trainCarPicked"
#  and highlightVisibleLocomotives as second move type

# Type of message: global/per player = private
# [:channel].include? 'table'  ? :global : :private

PacketData = Data.define(:channel, :packet_type, :move_id, :time, :data, :table_id)

MY_NAME = 'chooosen'.freeze

class BasePacket
  def initialize(hash)
    @packet_data = PacketData.new(**hash.except(:packet_id))
  end
  # def call; end
  def packet_type
    packet_data.packet_type
  end

  def move_id
    packet_data.move_id
  end

  def global?
    packet_data.channel.include? 'table' #  ? :global : :private
  end

  def me?
    !global? || player == MY_NAME
  end

  def player
    data.dig(:args, :player_name)
  end

  def table_id
    packet_data.table_id
  end

  private

  attr_reader :packet_data

  def data
    # raise "we do not handle multiple data in packet: #{packet_data}" if packet_data.data.length > 1
    # except highlightVisibleLocomotives. So we skip check here
    packet_data.data[0]
  end
end

class ClaimedRoute < BasePacket
  def call(state)
    data => { args: { number: length, colors: colors_a } }
    locomotives = colors_a.count { |color| color == COLORS_MAPPING.fetch(:Locomotive) }
    color_number = (colors_a - [COLORS_MAPPING.fetch(:Locomotive)])[0] || COLORS_MAPPING.fetch(:Locomotive)
    color = NUMBER_TO_COLORS_MAPPING[color_number]
    if me?
      return state.my_card_use color: , length:, locomotives:
    end

    return state.enemy_card_use color: , length: , locomotives:
  end
end
class TrainCarPicked < BasePacket
  def call(state)
    color = data.dig(:args, :color) # visible one
    if me?
      return state.my_take_card(color: NUMBER_TO_COLORS_MAPPING[color]) if color

      data => { args: { colors: colors_a } }
      state.my_take_card color: NUMBER_TO_COLORS_MAPPING[colors_a[-1]] if colors_a.length == 2
      return state.my_take_card color: NUMBER_TO_COLORS_MAPPING[colors_a[0]]
    end

    # either 1 x color or count Unknows
    return state.enemy_take_card(color: NUMBER_TO_COLORS_MAPPING[color]) if color

    data => { args: { count: } }
    state.enemy_take_card if count == 2
    state.enemy_take_card
  end
end


class SimpleNote < BasePacket
  def call(*)
    puts data[:log]
  end
end

class DestinationsPicked < BasePacket
  def call(state)
    puts data[:log]
  end
end

class DestinationCompleted < BasePacket
  def call(state)
    puts data[:log]
  end
end
