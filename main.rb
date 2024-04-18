require_relative 'statsBasedOnHistory'
require_relative 'state'
require_relative 'PacketFactory'
require 'json'
require 'active_support'
require "active_support/core_ext/array"
require "active_support/core_ext/hash"

DECK_CARDS_NO = 110

input = JSON.load_file('historyData.json').deep_symbolize_keys!

packets = input.dig(:data,:data).map { |entry| PacketFactory.create entry }

actionable_packets = packets.select { |packet| [ClaimedRoute, TrainCarPicked].include? packet.class }

global_packets = actionable_packets.select(&:global?)
my_packets = actionable_packets - global_packets

# temp_table = global_packets.index_by(&:move_id)
# my_packets.each { |packet| temp_table[packet.move_id] = packet }
# temp_table.values
# p global_packets
# p my_packets
my_packets.each do |packet|
  index = global_packets.find_index { |g_packet| g_packet.move_id == packet.move_id }
  global_packets[index] = packet
end

ready_packets = global_packets
# p ready_packets

visible_cards = { Locomotive: 1,
# Blue: 0,
# Black: 0,
Red: 2,
Orange: 2,
# Yellow: 0,
# Green: 0,
# White: 0,
# Pink: 0
}
start_setup = { Locomotive: 1, Orange: 1, Red: 2 }
state = State.new(visible_cards, start_setup, my_left_trains: 27, enemy_left_trains: 27)

ready_packets.each { |packet| packet.call state }

state.check_valid
puts state.export_to_excel
puts "enemy is #{ready_packets.detect { |packet| !packet.me?}.player}"
puts "Game/Table id is #{ready_packets.first.table_id}"
