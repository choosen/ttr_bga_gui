require_relative "packets"
require_relative "state"
require_relative "packet_factory"
require "json"
require "active_support"
require "active_support/core_ext/array"
require "active_support/core_ext/hash"

require "date"
require "amazing_print"
require "debug"

# https://boardgamearena.com/10/tickettoride/tickettoride/notificationHistory.html?table=500450283&from=108&privateinc=1&history=1&noerrortracking=true&dojo.preventCache=1713452046818
# url to search for, tab Preview, click right mouse button on top object and select: copy object.
# paste it to historyData.json
# adjust state: visible_cards, left_trains, start_setup
# and run script

input = JSON.load_file("historyData.json").deep_symbolize_keys!

packets = input.dig(:data, :data).map { |entry| PacketFactory.create entry }

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

# state = State.build # setup by hand in stateInitializer.rb:18
state = State.parse_js # setup by hand in stateInitializer.rb:39

ready_packets.each { |packet| packet.call state }

state.output_current_state if ENV["DEBUG"]
if state.valid?
  puts state.export_to_excel
  puts "enemy is #{packets.detect { |packet| !packet.me? }.player}"
  puts "Game/Table id is #{packets[0].table_id}"
  puts "Game started by #{ready_packets&.first&.player || "//waiting for first move"}"
  puts
  state.export_enemy_moves_excel
end
