module PacketFactory
  def self.create(hash)
    case hash
    in { data: [{type: move_type}, {type: "highlightVisibleLocomotives"}, *] }
      Object.const_get("#{move_type.camelize}").new(hash)
    in { data: [_, _, *] }
      raise "We do not support multiple data other than highlightVisibleLocomotives in packet #{hash}"
    in { data: [{type: move_type}] }
      Object.const_get("#{move_type.camelize}").new(hash)
    in { data: [{}] }
      raise "Missing move type #{hash}"
    in { data: [] }
      raise "Missing move object data #{hash}"
    in { data: data}
      raise "data #{data} in packet should be array #{hash}"
    in {}
      raise "Missing data in packet #{hash}"
    end
  end
end

# CHAT GPT 'BETTER' VERSION
# module PacketFactory
#   def self.create(hash)
#     case hash
#     in { data: [{ type: move_type }, { type: "highlightVisibleLocomotives" }, *] }
#       Object.const_get("#{move_type.capitalize}").new(hash)
#     in { data: [{ type: move_type }] }
#       Object.const_get("#{move_type.capitalize}").new(hash)
#     in { data: [_, _, *] } | { data: [{}] } | { data: [] }
#       raise "Invalid or unsupported packet data #{hash}"
#     else
#       raise "Missing data in packet #{hash}"
#     end
#   end
# end
