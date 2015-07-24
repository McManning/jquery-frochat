/*!
 *  frojs is a Javascript based visual chatroom client.
 *  Copyright (C) 2015 Chase McManning <cmcmanning@gmail.com>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License along
 *  with this program; if not, write to the Free Software Foundation, Inc.,
 *  51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

;(function($, window, document, undefined) {

    var _htmlEntityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': '&quot;',
        "'": '&#39;',
        "/": '&#x2F;'
    };
    
    var MAX_HISTORY_LINES = 300;

    /**
     * Utility method to escape HTML content from strings (chat, nicknames, etc)
     */
    function escapeHtml(string) {

        return String(string).replace(/[&<>"'\/]/g, function (s) {
          return _htmlEntityMap[s];
        });
    }
    
    function replaceURLWithHTMLLinks(text) {
        var exp = /(\b(https?|ftps?):\&#x2F;\&#x2F;[-A-Z0-9+&@#\&#x2F;%?=~_|!:,.;]*[-A-Z0-9+&@#\&#x2F;%=~_|])/ig;
        return text.replace(exp,"<a href='$1'>$1</a>"); 
    }

    function getTimestamp() {
    
        var date = new Date();

        var hour = date.getHours();
        
        var min = date.getMinutes();
        if (min < 10)
            min = '0' + min;
            
        var sec = date.getSeconds();
        if (sec < 10)
            sec = '0' + sec;
        
        return hour + ":" + min + ":" + sec;
    }
    
    $.fn.frojsChatbox = function(options) {
        
        options = $.extend({}, $.fn.frojsChatbox.options, options);
        
        // Only allow this plugin to be initialised on one div
        if (this.length > 1) {
            $.error('Cannot initialise multiple instances of frojsChatbox');
        }
    
        if (!fro || !fro.network) {
            $.error('Cannot initialise frojsChatbox without fro.network!');
        }
    
        return this.each(function() {
            
            var ele = $(this);
            
            $.fn.frojsChatbox._wrap(ele, options);
            
            ele.resizable({
                helper: "ui-resizable-helper", // @todo custom helper instead of override
                handles: "all",
                minHeight: options.minHeight,
                minWidth: options.minWidth,
                stop: function(event, ui) {
                    $.fn.frojsChatbox._resize(ele);
                }
            }).draggable({
                containment : options.containment,
                handle: ".header"
            });
            
            // Dock for a default state
            // @todo move to a method
            //ele.resizable('disable').draggable('disable');
            
            // Reroute focus events
            ele.find('.output-container').click(function(e) {
            
                //ele.find('input').focus();
                //return false;
            });

            ele.find('.scroll-pane').jScrollPane({
                contentWidth: '0px' // See http://stackoverflow.com/questions/4404944/how-do-i-disable-horizontal-scrollbar-in-jscrollpane-jquery
            });

            ele.find('input').keypress(function(e) {
                
                if (e.which == 13) { // hit enter
                
                    var msg = $(this).val();
                    if (msg.length > 0) {
                        if (fro.network.connected) {
                            fro.world.player.sendSay(msg);
                            $(this).val('');
                        } else {
                            
                            $.fn.frojsChatbox.append(ele, 'Not connected!', true);
                        }
                    }
                }
            });
            
            $.fn.frojsChatbox._resize(ele);
            
            $.fn.frojsChatbox.totalLines = 0;
            
            // Set initial position
            if (options.containment) {
                var parent = $(options.containment);
                var offset = parent.offset();
                
                //ele.css('left', offset.left + parent.width() - ele.width());
                //ele.css('top', offset.top - ele.height());
                
                ele.css('position', 'absolute');
                
                parent.prepend(ele);
            }
            
            // Bind network say event to add text to the chatbox
            fro.network.bind('say', function(evt) {
                $.fn.frojsChatbox._appendSay(ele, evt.eid, evt.msg);
            })
            .bind('leave', function(evt) { // Leave world { reason: 'Why I left' }
        
                var ent = fro.world.find(evt.eid);
                if (ent) {
                    $.fn.frojsChatbox.append(ele, 
                        escapeHtml(ent.nick) + ' disconnected (' + escapeHtml(evt.reason) + ')',
                        true
                    );
                }
            })
            .bind('join', function(evt) {
                
                // Entity may not exist yet, but we do know their nick from the join message
                $.fn.frojsChatbox.append(ele, 
                    escapeHtml(evt.nick) + ' connected', 
                    true
                );
            });
            
            $.fn.frojsChatbox.setDefaultMenuItems(ele);
            
        });
    };
    
    $.fn.frojsChatbox.setDefaultMenuItems = function(ele) {
    
        ele.find('.menu').append('<a href="#">Save Chat</a>');
        
    }
    
    $.fn.frojsChatbox.append = function(ele, message, timestamped) {
    
        // Prepend a timestamp to the message
        if (timestamped === true) {
            message = '<span class="timestamp">' + getTimestamp() + '</span> ' + message;
        }
        
        var api = ele.find('.scroll-pane').data('jsp');
        
        // Check for cap limit, and if we hit it, clear some room
        if ($.fn.frojsChatbox.totalLines < MAX_HISTORY_LINES) {
            $.fn.frojsChatbox.totalLines++;
            
        } else { // remove 300th line
            api.getContentPane().find('p:first').remove();
        }
        
        api.getContentPane().append('<p>'+message+'</p>');
        api.reinitialise();
        api.scrollToBottom();
    }
    
    $.fn.frojsChatbox._appendSay = function(ele, eid, message) {
        
        var entity = fro.world.find(eid);
        if (entity) {
        
            classes = new Array();
            classes.push('nickname');
            
            // If they're authenticated, make note of it for their messages 
            if (entity.authenticated === true) {
                classes.push('auth');
            }
            
            var output = '<span class="' + classes.join(' ') + '"><a href="#">' 
                        + escapeHtml(entity.nick) + '</a></span>: '
                        + replaceURLWithHTMLLinks(escapeHtml(message));
            
            $.fn.frojsChatbox.append(ele, output, true);
            
            // Play bleep clip (@todo probably move this)
            var sound = fro.world.find('chat_audio_node');
            if (sound) {
                sound.play();
            }
        }
    };
    
    $.fn.frojsChatbox._resize = function(ele) {

        // Note that the 3's are to fix the bottom line being hidden behind 
        // the bottom bar (because of border padding and all that)
        
        var height = (ele.height() - 63);
        ele.find('.output-container').css('height', height + 'px');
        ele.find('.background').css('height', (height + 3) + 'px');
        
        // refresh output content
        var api = ele.find('.scroll-pane').data('jsp');
        api.reinitialise();
        api.scrollToBottom();
    };
    
    $.fn.frojsChatbox._wrap = function(ele, options) {
        
        // Fill ele with content
        ele
            .addClass('ui-widget-content')
            .addClass('frojs-chatbox')
            .html(
                '<div class="background"></div>'
                + '<div class="header"><div class="controls">'
                //+ '  <a class="dock" title="Undock" href="#"><i class="icon-lock icon-white"></i></a>'
                + '</div></div>'
                + '<div class="output-container"><div class="scroll-pane"></div><div class="menu"></div></div>'
                + '<div class="input-container-wrap"><div class="input-container">'
                + '  <table><tr>'
                + '    <td class="controls-left"><i class="icon-comments"></i></td>'
                + '    <td class="input-td"><input type="text" placeholder="' + options.placeholder + '" maxlength="180" /></td>'
                + '    <td class="controls-right"><i class="icon-list"></i></td>'
                + '  </tr></table>'
                + '</div></div>'
            );
    };
    
    // Globally defined, overridable options
    // The user can override defaults as necessary
    // via $.fn.frojs.someKey = 'value';
    $.fn.frojsChatbox.options = {
        instance: null, // Frojs instance to bind this chatbox to
        placeholder: 'Tab to start typing ...', // Input placeholder
        containment: null, // Selector to the draggable container
        minWidth: 200, // Minimum dimensions when resizing
        minHeight: 100 // Minimum dimensions when resizing
    };
    
})(jQuery, window, document);
