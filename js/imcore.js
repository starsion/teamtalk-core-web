// window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext
// var audioContext = new window.AudioContext()

// var client = new TeamTalkWebClient({ wsurl: 'ws://10.9.38.92:9090' })

var currentSession = {}

/**
 * 登录入口
 * @param {Object} formData 表单数据，帐号，密码
 */
function doLogin(formData) {
	return new Promise((resolve, reject) => {
		if (client.wsIsReady()) {
			loginAction(formData)
				.then(
					(data) => {
						if (data === 1) {
							bindMsgHadler()
							resolve('login_success')
						}
						else if (data === 0) {
							reject('login_faild ')
						}
					}
				)
		} else {
			waitWSConnectionForLogin(formData)
				.then(
					(data) => {
						if (data === 1) {
							bindMsgHadler()
							resolve('login_success')
						}
						else if (data === 0) {
							reject('login_faild ')
						}
					}
				)
		}
	})
}

/**
 * 登录方法
 * @param {Object} formData 表单数据，帐号，密码
 */
function loginAction(formData) {
	var imLoginData = { username: formData.username, password: md5(formData.password) }
	return new Promise((resolve, reject) => {
		client.loginAction(imLoginData, function (state, resData) {
			console.log('state---------', state, 'userinfo-----------', resData)
			if (state) {
				imDb.initDb(client.uid)
				client.getAllFriends({}, function (state, res) {
					var users = res.userList
					for (var id in users) {
						var user = users[id]
						imDb.addUsertoDb(user.userId, user)
					}
				})
				resolve(1)
			} else {
				reject(0)
			}
		})
	})
}

/**
 * 等待连接，轮询ws状态
 * @param {*} formData 表单数据，帐号，密码
 */
function waitWSConnectionForLogin(formData) {
	console.log('wait for connect')
	return new Promise((resolve, reject) => {
		setTimeout(function () {
			if (client.wsIsReady()) {
				loginAction(formData)
					.then(
						(data) => {
							resolve(data)
						}
					)
			} else {
				waitWSConnectionForLogin(formData)
			}
		}, 1000)
	})
}

/**
 * 获取近期会话
 */
function getRecentlySession() {
	var recentList = []
	return new Promise((resolve, reject) => {
		if (imDb.sessionList) {
			recentList = bindSessions(imDb.sessionList)
			resolve(recentList)
		} else {
			client.getRecentlySession({ latestUpdateTime: 0 }, function (state, res) {
				// console.log('近期会话信息---------', res)
				imDb.sessionList = res.contactSessionList
				recentList = bindSessions(imDb.sessionList)
				resolve(recentList)
			})
		}
	})
}

/**
 * 获取当前会话人聊天记录，第一次api获取，保存至本地缓存，后续从缓存获取
 * @param {} sessionType 会话类型，1-单聊；2-群聊
 * @param {} sessionId 会话id
 */
function getMsgForChatMain(sessionType, sessionId) {
	var key = sessionType + '_' + sessionId
	var msgList = []
	var newMsg = []
	var nullUserIds = []
	currentSession.messages = imDb.getMessageBykey(key)
	console.log('currentSession-----------', currentSession)
	return new Promise((resolve, reject) => {
		if (currentSession.messages) {
			msgList = currentSession.messages
		} else {
			var content = { sessionId: sessionId, sessionType: sessionType, msgIdBegin: 0, msgCnt: 40 }
			client.getMsgListApiAction(content, function (state, res) {
				imDb.addMessagetoDb(key, res.msgList)
				msgList = res.msgList
				for (var i in msgList) {
					if (msgList[i].msgId > currentSession.currentMsgId) {
						currentSession.currentMsgId = msgList[i].msgId;
					}
					var msg = {};
					var sender = msgList[i].fromSessionId;
					var userInfo = imDb.getUserbyId('' + sender);
					//var text = '';
					//console.log('text:' + text);
					if (msgList[i].msgType == MsgType.MSG_TYPE_GROUP_TEXT || msgList[i].msgType == MsgType.MSG_TYPE_SINGLE_TEXT) {
						//console.log(msgList[i].msgData);
						var text = aesDecryptText(msgList[i].msgData);
						if (text.indexOf(DD_MESSAGE_IMAGE_PREFIX) == 0) {

							var index = text.indexOf('{') + 2;
							var img = text.substr(index, text.lastIndexOf('}') - 1 - index);
							console.log(img);
							msg.text = img
							msg.hasImage = true;
						} else {
							msg.text = text
							// console.log('text=-----',text)
						}
					} else {
						var dv = new DataView(msgList[i].msgData.slice(0, 4).buffer);
						var audioTime = dv.getUint32(0) + '秒';
						msg.text = i + audioTime
						// console.log('audioTime=-----',audioTime)
					}
					if (userInfo) {
						msg.name = userInfo.userNickName;
						msg.avatar = userInfo.avatarUrl;
					} else {
						nullUserIds.push(sender);
						msg.name = sender;
						msg.avatar = '';
					}
					if (client.uid == sender) {
						msg.type = 'sent';
					} else {
						msg.type = 'received';
					}
					msg.label = '';
					msg.senderId = sender;
					var time = new Date(msgList[i].createTime * 1000).toLocaleString().split(', ');
					msg.day = time[0];
					msg.time = time[1];
					newMsg.push(msg)
				}
				resolve([
					...nullUserIds,
					...newMsg
				])
			})
		}
	})
}

/**
 * 解析会话信息
 */
function bindSessions(sessionList) {
	// console.log('即将解析的会话--------', sessionList)
	var groupList = []
	var nullUserIds = []
	var recentSession = []
	for (var i in sessionList) {
		var session = sessionList[i]
		if (session == null) {
			continue
		}
		var text = session.latestMsgData
		if (!!text) {

			text = aesDecryptText(text)
			// console.log('text-------', text)
			if (text.indexOf(DD_MESSAGE_IMAGE_PREFIX) == 0) {
				text = "[图片]"
			}
		} else {
			text = ''
		}

		var sessionName = '未知'
		var sessionAvatar = ' '
		if (session.sessionType == SessionType.SESSION_TYPE_GROUP) {
			var groupinfo = imDb.findGroupInfoById(session.sessionId)
			if (!!groupinfo) {
				// console.log('groupinfo----', groupinfo)
				sessionName = groupinfo.groupName
				sessionAvatar = groupinfo.groupAvatar
				recentSession.push({
					sessionName: sessionName,
					sessionAvatar: sessionAvatar,
					text: text,
				})
			} else if (autoRemove) {
				continue
			} else {
				groupList.push({ group_id: session.sessionId, version: 0 })
			}
		} else {
			var userinfo = imDb.getUserbyId(session.sessionId)
			// console.log('userinfo----------', userinfo)
			if (!!userinfo) {
				sessionName = userinfo.userNickName
				sessionAvatar = userinfo.avatarUrl
				recentSession.push({
					sessionName: sessionName,
					sessionAvatar: sessionAvatar,
					text: text,
				})
			} else {
				//uerid不在数据库的处理为陌生人
				nullUserIds.push({
					sessionName: '陌生人',
					sessionAvatar: 'null',
					text: text,
				})
			}
		}
	}
	return [
		...nullUserIds,
		...recentSession
	]
}

/**
 * 获取朋友列表
 */
function getFirendsConcats() {
	var user_list = imDb.getAllUserFromDb()
	return new Promise((resolve, reject) => {
		if (user_list.length > 0) {
			// console.log('user_list---------', user_list)
			resolve(user_list)
		} else {
			client.getAllFriends({}, function (state, res) {
				if (state) {
					// console.log('好友列表-----------', res)
					var users = res.userList
					for (var id in users) {
						var user = users[id]
						imDb.addUsertoDb(user.userId, user)
					}
					resolve(users)
				} else {
					reject('get user list fail')
				}
			})
		}
	})
}

/**
 * 获取群列表
 */
function getGroupConcats() {
	var group_list = imDb.getAllGroupList()
	return new Promise((resolve, reject) => {
		if (group_list.length > 0) {
			// console.log('群列表-------', group_list)
			resolve(group_list)
		} else {
			client.getGroupListApiAction(function (state, res) {
				if (state) {
					var groupVersionList = []
					for (index in res.groupVersionList) {
						var group_version = res.groupVersionList[index]
						group_version.version = 0
						groupVersionList.push(group_version)
					}
					var content = { groupVersionList: groupVersionList }
					client.getGroupInfoApiAction(content, function (state, result) {
						imDb.addGroupInfoToDb(result.groupInfoList)
						// bindDataToGrouplist()
						resolve(result.groupInfoList)
					})
				} else {
					reject('get group list fail')
				}
			})
		}
	})
}

/**
 * 发送消息
 * @param {*} messageText 消息内容
 * @param {} sessionType 会话类型
 * @param {} sessionId 会话id
 */
function sendMessage(messageText, sessionType, sessionId) {
	return new Promise((resolve, reject) => {
		if (sessionType == SessionType.SESSION_TYPE_GROUP) {
			client.sendGroupTextMsg(messageText, sessionId, function (state, res) {
				if (state) {
					resolve('send Success:' + JSON.stringify(res));
					res.userId = res.fromUserId;
					res.fromSessionId = res.fromUserId;
					res.msgData = Base64.decode(res.msgData);//发送的时候被base64了一次 所以要解回来
					res.type = res.msgType;
					res.sessionId = res.toSessionId;
					var key = sessionType + '_' + sessionId;
					imDb.addMessagetoDb(key, res);
				} else {
					reject('send fail')
				}
			})
		} else {
			client.sendSingleTextMsg(messageText, sessionId, function (state, res) {
				if (state) {
					//console.log(res);
					resolve('send Success:' + JSON.stringify(res));
					res.userId = res.fromUserId;
					res.fromSessionId = res.fromUserId;
					res.msgData = Base64.decode(res.msgData);//发送的时候被base64了一次 所以要解回来
					res.type = res.msgType;
					res.sessionId = res.toSessionId;
					var key = sessionType + '_' + sessionId;
					imDb.addMessagetoDb(key, res);
				} else {
					reject('send fail');
				}
			});
		}
	})

}

/**
 * 绑定接收消息事件
 */
function bindMsgHadler() {
	client.msgHandler = function (newMsg) {
		console.log('new Message------------:', newMsg);
		newMsg.userId = newMsg.fromUserId;
		newMsg.type = newMsg.msgType;
		newMsg.fromSessionId = newMsg.fromUserId;
		newMsg.sessionId = newMsg.toSessionId;
		var msgSessionType = (newMsg.msgType === MsgType.MSG_TYPE_GROUP_TEXT || newMsg.type === MsgType.MSG_TYPE_GROUP_AUDIO) ? SessionType.SESSION_TYPE_GROUP : SessionType.SESSION_TYPE_SINGLE;
		var msgSessionKey = msgSessionType + '_' + newMsg.toSessionId;

		if (msgSessionType === SessionType.SESSION_TYPE_SINGLE && newMsg.userId != client.uid) {
			msgSessionKey = msgSessionType + '_' + newMsg.userId;
		}
		imDb.addMessagetoDb(msgSessionKey, newMsg);
	}
}


/**
 * 获取未读消息
 */
function getUnreadMsg() {
	return new Promise((resolve, reject) => {
		client.getUnreadMessageCnt({}, function (state, res) {
			if (state) {
				resolve(res.unreadinfoList)
			} else {
				reject(res)
			}
		})
	})
}



