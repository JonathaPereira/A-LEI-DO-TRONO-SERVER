#include <windows.h>
#include <string>
#include <sstream>
#include <set>
#include <iostream>
#include <algorithm>
// Pipe-only helper: no listener, service, elevation or unattended access.
std::set<int> keys,buttons;
bool extended(int vk){return vk==VK_RCONTROL||vk==VK_RMENU||vk==VK_LWIN||vk==VK_RWIN||(vk>=VK_PRIOR&&vk<=VK_DOWN)||vk==VK_INSERT||vk==VK_DELETE;}
void key(int vk,bool down){INPUT i{};i.type=INPUT_KEYBOARD;i.ki.wScan=static_cast<WORD>(MapVirtualKeyW(vk,MAPVK_VK_TO_VSC));i.ki.dwFlags=KEYEVENTF_SCANCODE|(extended(vk)?KEYEVENTF_EXTENDEDKEY:0)|(down?0:KEYEVENTF_KEYUP);SendInput(1,&i,sizeof(i));if(down)keys.insert(vk);else keys.erase(vk);}
void button(int b,bool down){const DWORD flags[3][2]={{MOUSEEVENTF_LEFTUP,MOUSEEVENTF_LEFTDOWN},{MOUSEEVENTF_MIDDLEUP,MOUSEEVENTF_MIDDLEDOWN},{MOUSEEVENTF_RIGHTUP,MOUSEEVENTF_RIGHTDOWN}};INPUT i{};i.type=INPUT_MOUSE;i.mi.dwFlags=flags[b][down?1:0];SendInput(1,&i,sizeof(i));if(down)buttons.insert(b);else buttons.erase(b);}
void release(){auto k=keys,b=buttons;for(int v:k)key(v,false);for(int v:b)button(v,false);}
int main(){
 SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 HANDLE pipe=GetStdHandle(STD_INPUT_HANDLE);if(GetFileType(pipe)!=FILE_TYPE_PIPE)return 2;
 std::cout<<"READY\n"<<std::flush;ULONGLONG last=GetTickCount64();std::string pending;
 while(GetTickCount64()-last<6000){
  DWORD bytes=0;if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&bytes,nullptr))break;
  if(!bytes){Sleep(4);continue;}char buffer[2048];DWORD read=0;if(!ReadFile(pipe,buffer,std::min<DWORD>(bytes,sizeof(buffer)),&read,nullptr)||!read)break;
  pending.append(buffer,read);if(pending.size()>8192)break;size_t pos;
  while((pos=pending.find('\n'))!=std::string::npos){
   std::istringstream row(pending.substr(0,pos));pending.erase(0,pos+1);char type=0;row>>type;int a=0,b=0;last=GetTickCount64();
   if(type=='q'){release();return 0;}if(type=='r'){release();continue;}
   if(type=='m'&&(row>>a>>b)){const int x=GetSystemMetrics(SM_XVIRTUALSCREEN),y=GetSystemMetrics(SM_YVIRTUALSCREEN),w=GetSystemMetrics(SM_CXVIRTUALSCREEN),h=GetSystemMetrics(SM_CYVIRTUALSCREEN);INPUT i{};i.type=INPUT_MOUSE;i.mi.dx=static_cast<LONG>((std::clamp(a,x,x+w-1)-static_cast<double>(x))*65535/std::max(1,w-1));i.mi.dy=static_cast<LONG>((std::clamp(b,y,y+h-1)-static_cast<double>(y))*65535/std::max(1,h-1));i.mi.dwFlags=MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE|MOUSEEVENTF_VIRTUALDESK;SendInput(1,&i,sizeof(i));}
   else if(type=='b'&&(row>>a>>b)&&a>=0&&a<=2&&(b==0||b==1))button(a,b!=0);
   else if(type=='k'&&(row>>a>>b)&&a>0&&a<256&&(b==0||b==1))key(a,b!=0);
   else if(type=='w'&&(row>>a)){INPUT i{};i.type=INPUT_MOUSE;i.mi.dwFlags=MOUSEEVENTF_WHEEL;i.mi.mouseData=static_cast<DWORD>(std::clamp(a,-1200,1200));SendInput(1,&i,sizeof(i));}
  }
 }
 release();return 0;
}
