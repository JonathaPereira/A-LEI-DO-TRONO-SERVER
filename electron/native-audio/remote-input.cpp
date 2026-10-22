#include <windows.h>
#include <Xinput.h>
#include <ViGEm/Client.h>
#include <string>
#include <sstream>
#include <set>
#include <iostream>
#include <algorithm>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
// Pipe-only helper. Each explicitly granted guest gets its own Xbox device.
std::set<int> keys,buttons;
PVIGEM_CLIENT bus=nullptr;PVIGEM_TARGET pad=nullptr;
bool extended(int vk){return vk==VK_RCONTROL||vk==VK_RMENU||vk==VK_LWIN||vk==VK_RWIN||(vk>=VK_PRIOR&&vk<=VK_DOWN)||vk==VK_INSERT||vk==VK_DELETE;}
void key(int vk,bool down){INPUT i{};i.type=INPUT_KEYBOARD;i.ki.wScan=static_cast<WORD>(MapVirtualKeyW(vk,MAPVK_VK_TO_VSC));i.ki.dwFlags=KEYEVENTF_SCANCODE|(extended(vk)?KEYEVENTF_EXTENDEDKEY:0)|(down?0:KEYEVENTF_KEYUP);SendInput(1,&i,sizeof(i));if(down)keys.insert(vk);else keys.erase(vk);}
void button(int b,bool down){const DWORD flags[3][2]={{MOUSEEVENTF_LEFTUP,MOUSEEVENTF_LEFTDOWN},{MOUSEEVENTF_MIDDLEUP,MOUSEEVENTF_MIDDLEDOWN},{MOUSEEVENTF_RIGHTUP,MOUSEEVENTF_RIGHTDOWN}};INPUT i{};i.type=INPUT_MOUSE;i.mi.dwFlags=flags[b][down?1:0];SendInput(1,&i,sizeof(i));if(down)buttons.insert(b);else buttons.erase(b);}
void neutral(){if(pad){XUSB_REPORT r{};vigem_target_x360_update(bus,pad,r);}}
void release(){auto k=keys,b=buttons;for(int v:k)key(v,false);for(int v:b)button(v,false);neutral();}
void unplug(){if(pad){vigem_target_remove(bus,pad);vigem_target_free(pad);pad=nullptr;}if(bus){vigem_disconnect(bus);vigem_free(bus);bus=nullptr;}}
int main(int argc,char**argv){
 const std::string mode=argc>1?argv[1]:"";
 if(mode=="--read-xinput"){std::cout<<"[";bool comma=false;for(DWORD i=0;i<4;i++){XINPUT_STATE s{};if(XInputGetState(i,&s)==ERROR_SUCCESS){if(comma)std::cout<<",";comma=true;std::cout<<"{\"index\":"<<i<<",\"buttons\":"<<s.Gamepad.wButtons<<",\"lx\":"<<s.Gamepad.sThumbLX<<",\"lt\":"<<static_cast<int>(s.Gamepad.bLeftTrigger)<<"}";}}std::cout<<"]\n";return 0;}
 if(mode=="--probe"||mode=="--gamepad"){
  bus=vigem_alloc();if(!bus||!VIGEM_SUCCESS(vigem_connect(bus))){unplug();std::cerr<<"Instale o driver opcional ViGEmBus no PC anfitrião para usar um controle separado.\n";return 3;}
  if(mode=="--probe"){unplug();return 0;}
  pad=vigem_target_x360_alloc();const auto added=pad?vigem_target_add(bus,pad):VIGEM_ERROR_INVALID_TARGET;if(!VIGEM_SUCCESS(added)){unplug();std::cerr<<"Não foi possível conectar o controle Xbox virtual. Verifique o driver Xbox do Windows. Código: "<<std::hex<<added<<".\n";return 4;}
 }
 SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 HANDLE pipe=GetStdHandle(STD_INPUT_HANDLE);if(GetFileType(pipe)!=FILE_TYPE_PIPE){unplug();return 2;}
 ULONG index=99;if(pad)vigem_target_x360_get_user_index(bus,pad,&index);
 std::cout<<"READY "<<(pad?"gamepad":"desktop")<<" "<<index<<"\n"<<std::flush;
 std::mutex mutex;std::condition_variable wake;bool done=false,padActive=false;ULONGLONG last=GetTickCount64(),lastPad=last;
 HANDLE reader=nullptr;DuplicateHandle(GetCurrentProcess(),GetCurrentThread(),GetCurrentProcess(),&reader,0,FALSE,DUPLICATE_SAME_ACCESS);
 // Blocking pipe input avoids the previous polling delay. The independent
 // watchdog releases lost gamepad snapshots even while the pipe is idle.
 std::thread watchdog([&]{std::unique_lock<std::mutex> lock(mutex);while(!done){wake.wait_for(lock,std::chrono::milliseconds(20));const auto now=GetTickCount64();if(padActive&&now-lastPad>500){neutral();padActive=false;}if(now-last>6000){release();CancelSynchronousIo(reader);}}});
 std::string pending;bool quit=false;
 while(!quit){char buffer[2048];DWORD read=0;if(!ReadFile(pipe,buffer,sizeof(buffer),&read,nullptr)||!read)break;
  std::lock_guard<std::mutex> lock(mutex);if(done||GetTickCount64()-last>=6000)break;pending.append(buffer,read);if(pending.size()>8192)break;size_t pos;
  while((pos=pending.find('\n'))!=std::string::npos){
   std::istringstream row(pending.substr(0,pos));pending.erase(0,pos+1);char type=0;row>>type;int a=0,b=0;last=GetTickCount64();
   if(type=='q'){quit=true;break;}if(type=='r'){release();padActive=false;continue;}
   if(pad){if(type=='g'){int lt,rt,lx,ly,rx,ry;if((row>>a>>lt>>rt>>lx>>ly>>rx>>ry)&&a>=0&&a<=65535&&!(a&~0xF3FF)&&lt>=0&&lt<=255&&rt>=0&&rt<=255&&lx>=-32768&&lx<=32767&&ly>=-32768&&ly<=32767&&rx>=-32768&&rx<=32767&&ry>=-32768&&ry<=32767){XUSB_REPORT r{};r.wButtons=static_cast<USHORT>(a);r.bLeftTrigger=static_cast<BYTE>(lt);r.bRightTrigger=static_cast<BYTE>(rt);r.sThumbLX=static_cast<SHORT>(lx);r.sThumbLY=static_cast<SHORT>(ly);r.sThumbRX=static_cast<SHORT>(rx);r.sThumbRY=static_cast<SHORT>(ry);if(!VIGEM_SUCCESS(vigem_target_x360_update(bus,pad,r))){quit=true;break;}lastPad=last;padActive=true;}}continue;}
   if(type=='m'&&(row>>a>>b)){const int x=GetSystemMetrics(SM_XVIRTUALSCREEN),y=GetSystemMetrics(SM_YVIRTUALSCREEN),w=GetSystemMetrics(SM_CXVIRTUALSCREEN),h=GetSystemMetrics(SM_CYVIRTUALSCREEN);INPUT i{};i.type=INPUT_MOUSE;i.mi.dx=static_cast<LONG>((std::clamp(a,x,x+w-1)-static_cast<double>(x))*65535/std::max(1,w-1));i.mi.dy=static_cast<LONG>((std::clamp(b,y,y+h-1)-static_cast<double>(y))*65535/std::max(1,h-1));i.mi.dwFlags=MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE|MOUSEEVENTF_VIRTUALDESK;SendInput(1,&i,sizeof(i));}
   else if(type=='b'&&(row>>a>>b)&&a>=0&&a<=2&&(b==0||b==1))button(a,b!=0);
   else if(type=='k'&&(row>>a>>b)&&a>0&&a<256&&(b==0||b==1))key(a,b!=0);
   else if(type=='w'&&(row>>a)){INPUT i{};i.type=INPUT_MOUSE;i.mi.dwFlags=MOUSEEVENTF_WHEEL;i.mi.mouseData=static_cast<DWORD>(std::clamp(a,-1200,1200));SendInput(1,&i,sizeof(i));}
  }
 }
 {std::lock_guard<std::mutex> lock(mutex);done=true;release();}wake.notify_one();watchdog.join();CloseHandle(reader);unplug();return 0;
}
