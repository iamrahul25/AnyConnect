import React, { useState, useRef, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, MessageSquare, Phone, SkipForward, Send, Smile } from 'lucide-react';

export default function VideoPanel() {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: 'Hey there!', sender: 'other', time: '10:30 AM' },
    { id: 2, text: 'Hello! How are you?', sender: 'me', time: '10:31 AM' },
  ]);
  const [isConnected, setIsConnected] = useState(true);
  const chatEndRef = useRef(null);

  const emojis = ['😊', '😂', '❤️', '👍', '👋', '🎉', '😎', '🔥', '✨', '💯', '😍', '🤔', '😢', '😮', '👏', '🙌'];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (message.trim()) {
      const newMessage = {
        id: messages.length + 1,
        text: message,
        sender: 'me',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([...messages, newMessage]);
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const handleEmojiClick = (emoji) => {
    setMessage(message + emoji);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleEndCall = () => {
    setIsConnected(false);
    alert('Call ended');
  };

  const handleNext = () => {
    setMessages([]);
    alert('Connecting to next person...');
  };

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col">
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Section */}
        <div className="flex-1 relative bg-black">
          {/* Other Person's Video (Main) */}
          <div className="w-full h-full relative">
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              {isConnected ? (
                <div className="text-center">
                  <Video className="w-24 h-24 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Stranger's Video</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-400 text-xl mb-2">Not Connected</p>
                  <p className="text-gray-500">Click Next to find someone</p>
                </div>
              )}
            </div>

            {/* Your Video (Picture-in-Picture) */}
            <div className="absolute bottom-4 right-4 w-64 h-48 bg-gray-700 rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg">
              <div className="w-full h-full flex items-center justify-center relative">
                {isVideoOn ? (
                  <div className="text-center">
                    <Video className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Your Video</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Video Off</p>
                  </div>
                )}
              </div>
            </div>

            {/* Connection Status */}
            {isConnected && (
              <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                Connected
              </div>
            )}
          </div>
        </div>

        {/* Chat Section */}
        {showChat && (
          <div className="w-96 bg-gray-800 flex flex-col border-l border-gray-700">
            {/* Chat Header */}
            <div className="p-4 bg-gray-900 border-b border-gray-700">
              <h2 className="text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat
              </h2>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      msg.sender === 'me'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <p className="break-words">{msg.text}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender === 'me' ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="p-3 bg-gray-750 border-t border-gray-700">
                <div className="grid grid-cols-8 gap-2">
                  {emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => handleEmojiClick(emoji)}
                      className="text-2xl hover:bg-gray-600 rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="p-4 bg-gray-900 border-t border-gray-700">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Smile className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex-1">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500"
                    rows="1"
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-gray-900 border-t border-gray-700 p-4">
        <div className="flex items-center justify-center gap-3">
          {/* Mute/Unmute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-all ${
              isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          {/* Video On/Off */}
          <button
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`p-4 rounded-full transition-all ${
              !isVideoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isVideoOn ? 'Turn off video' : 'Turn on video'}
          >
            {isVideoOn ? (
              <Video className="w-6 h-6 text-white" />
            ) : (
              <VideoOff className="w-6 h-6 text-white" />
            )}
          </button>

          {/* Toggle Chat */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-full transition-all"
            title="Toggle chat"
          >
            <MessageSquare className="w-6 h-6 text-white" />
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            className="px-6 py-4 bg-blue-600 hover:bg-blue-700 rounded-full transition-all flex items-center gap-2"
            title="Next person"
          >
            <SkipForward className="w-6 h-6 text-white" />
            <span className="text-white">Next</span>
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCall}
            className="px-6 py-4 bg-red-600 hover:bg-red-700 rounded-full transition-all flex items-center gap-2"
            title="End call"
          >
            <Phone className="w-6 h-6 text-white rotate-[135deg]" />
            <span className="text-white">End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
