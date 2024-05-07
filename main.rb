require_relative 'statsBasedOnHistory'
require_relative 'state'
require_relative 'PacketFactory'
require 'json'
require 'active_support'
require "active_support/core_ext/array"
require "active_support/core_ext/hash"

# https://boardgamearena.com/10/tickettoride/tickettoride/notificationHistory.html?table=500450283&from=108&privateinc=1&history=1&noerrortracking=true&dojo.preventCache=1713452046818
# url to search for, tab Preview, click right mouse button on top object and select: copy object.
# paste it to historyData.json
# adjust state: visible_cards, left_trains, start_setup
# and run script

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

visible_cards = {
  Locomotive: 1,
  Blue: 1,
  # Black: 1,
  # Red: 2,
  # Orange: 2,
  # Yellow: 0,
  # Green: 2,
  White: 2,
  Pink: 1
}

start_setup = { Green: 1, Locomotive: 1, Red: 1, Yellow: 1 }
my_left_trains = 45
enemy_left_trains = 45
state = State.new(visible_cards, start_setup, my_left_trains:, enemy_left_trains:)

ready_packets.each { |packet| packet.call state }

if state.valid?
  state.output_current_state
  puts state.export_to_excel
  puts "enemy is #{ready_packets.detect { |packet| !packet.me?}.player}"
  puts "Game/Table id is #{ready_packets[0].table_id}"
  puts
  puts 'Enemy moves:'
  puts state.export_enemy_moves_excel
end