module PacketFactory
  def self.create(hash)
    case hash
    in { data: [{type: move_type}, {type: 'highlightVisibleLocomotives'}, *] }
      Object.const_get("#{move_type[0].upcase}#{move_type[1..-1]}").new(hash)
    in { data: [_, _, *] }
      raise "We do not support multiple data other than highlightVisibleLocomotives in packet #{hash}"
    in { data: [{type: move_type}] }
      # move_type.camelize.constantize.new(hash)
      # "#{move_type[0].upcase}#{move_type[1..-1]}".constantize.new(hash)
      Object.const_get("#{move_type[0].upcase}#{move_type[1..-1]}").new(hash)
    in { data: [{}] }
      raise "Missing move type #{hash}"
    in { data: [] }
      raise "Missing move object data #{hash}"
    in { data: data}
      raise "data in packet should be array #{hash}"
    in {}
      raise "Missing data in packet #{hash}"
    end
  end
end