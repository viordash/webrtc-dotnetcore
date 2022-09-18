using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;

namespace webrtc_dotnetcore.Hubs
{
    public class WebRTCHub : Hub
    {
        private static RoomManager roomManager = new RoomManager();

        public override Task OnConnectedAsync()
        {
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            roomManager.DeleteRoom(Context.ConnectionId);
            _ = NotifyRoomInfoAsync(false);
            return base.OnDisconnectedAsync(exception);
        }

        public async Task CreateRoom(string data)
        {

            var obj = JsonConvert.DeserializeObject<RoomData>(data);
            RoomInfo roomInfo = roomManager.CreateRoom(Context.ConnectionId, obj.name, obj.stunAddress, obj.stunUsername, obj.stunPassword);
            if (roomInfo != null)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, roomInfo.RoomId);
                await NotifyRoomInfoAsync(false);
                await Clients.Caller.SendAsync("created", roomInfo.RoomId);
            }
            else
            {
                await Clients.Caller.SendAsync("error", "error occurred when creating a new room.");
            }
        }

        public async Task Join(string roomId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

            await Clients.Caller.SendAsync("joined", roomId);
            await Clients.Group(roomId).SendAsync("ready");

            //remove the room from room list.
            if (int.TryParse(roomId, out int id))
            {
                roomManager.DeleteRoom(id);
                await NotifyRoomInfoAsync(false);
            }
        }

        public async Task LeaveRoom(string roomId)
        {
            await Clients.Group(roomId).SendAsync("bye");
        }

        public async Task GetRoomInfo()
        {
            await NotifyRoomInfoAsync(true);
        }

        public async Task SendMessage(string roomId, object message)
        {
            await Clients.OthersInGroup(roomId).SendAsync("message", message);
        }

        public async Task NotifyRoomInfoAsync(bool notifyOnlyCaller)
        {
            List<RoomInfo> roomInfos = roomManager.GetAllRoomInfo();
            var list = from room in roomInfos
                       select new
                       {
                           RoomId = room.RoomId,
                           Name = room.Name,
                           StunAddress = room.StunAddress,
                           StunUsername = room.StunUsername,
                           StunPassword = room.StunPassword,
                           Button = "<button class=\"joinButton\">Join!</button>"
                       };
            var data = JsonConvert.SerializeObject(list);

            if (notifyOnlyCaller)
            {
                await Clients.Caller.SendAsync("updateRoom", data);
            }
            else
            {
                await Clients.All.SendAsync("updateRoom", data);
            }
        }
    }

    /// <summary>
    /// Room management for WebRTCHub
    /// </summary>
    public class RoomManager
    {
        private int nextRoomId;
        /// <summary>
        /// Room List (key:RoomId)
        /// </summary>
        private ConcurrentDictionary<int, RoomInfo> rooms;

        public RoomManager()
        {
            nextRoomId = 1;
            rooms = new ConcurrentDictionary<int, RoomInfo>();
        }

        public RoomInfo CreateRoom(string connectionId, string name, string stunAddress, string stunUsername, string stunPassword)
        {
            rooms.TryRemove(nextRoomId, out _);

            //create new room info
            var roomInfo = new RoomInfo
            {
                RoomId = nextRoomId.ToString(),
                Name = name,
                StunAddress = stunAddress,
                StunUsername = stunUsername,
                StunPassword = stunPassword,
                HostConnectionId = connectionId
            };
            bool result = rooms.TryAdd(nextRoomId, roomInfo);

            if (result)
            {
                nextRoomId++;
                return roomInfo;
            }
            else
            {
                return null;
            }
        }

        public void DeleteRoom(int roomId)
        {
            rooms.TryRemove(roomId, out _);
        }

        public void DeleteRoom(string connectionId)
        {
            int? correspondingRoomId = null;
            foreach (var pair in rooms)
            {
                if (pair.Value.HostConnectionId.Equals(connectionId))
                {
                    correspondingRoomId = pair.Key;
                }
            }

            if (correspondingRoomId.HasValue)
            {
                rooms.TryRemove(correspondingRoomId.Value, out _);
            }
        }

        public List<RoomInfo> GetAllRoomInfo()
        {
            return rooms.Values.ToList();
        }
    }

    public class RoomInfo
    {
        public string RoomId { get; set; }
        public string Name { get; set; }
        public string StunAddress { get; set; }
        public string StunUsername { get; set; }
        public string StunPassword { get; set; }
        public string HostConnectionId { get; set; }
    }

    public class RoomData{
        public string name { get; set; }
        public string stunAddress { get; set; }
        public string stunUsername { get; set; }
        public string stunPassword { get; set; }
    }
}
