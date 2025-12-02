import time
from head_control import HeadMotors

class RobotHead:
    def __init__(self):
        self.motors = HeadMotors()
        # to avoid burning motors! DOUBLE CHECK WITH ALI
        self.LIMITS = {
            "head_yaw":   {"min": 590, "center": 807, "max": 970},  # left=min / right 
            # mirrly POV: 970 means to right / 590 means to left
            "head_pitch": {"min": 118, "center": 200, "max": 279},  # up / down
            # check directionality in lab
            "eye_self":   {"min": 221, "center": 245, "max": 268},  # eyeballs
            # check directionality in lab
        }

    def _safe_move(self, component, target_pos, speed=200):
        print(f"Moving {component} to {target_pos} at speed {speed}")
        self.motors.move(component, target_pos, speed)
        # sleep to give time to physically get to pos
        time.sleep(1.0) 

    def all_center(self):
        print("CENTRE ALL")
        self._safe_move("head_yaw", self.LIMITS["head_yaw"]["center"])
        self._safe_move("head_pitch", self.LIMITS["head_pitch"]["center"])
        self._safe_move("eye_self", self.LIMITS["eye_self"]["center"])

    def head_left(self):
        self._safe_move("head_yaw", self.LIMITS["head_yaw"]["min"])

    def head_right(self):
        self._safe_move("head_yaw", self.LIMITS["head_yaw"]["max"])

    def head_up(self):
        self._safe_move("head_pitch", self.LIMITS["head_pitch"]["max"])

    def head_down(self):
        self._safe_move("head_pitch", self.LIMITS["head_pitch"]["min"])

    def eyes_left(self):
        self._safe_move("eye_self", self.LIMITS["eye_self"]["min"])

    def eyes_right(self):
        self._safe_move("eye_self", self.LIMITS["eye_self"]["max"])

    def test_full_range_of_motion(self):
        print("TESTING RANGE OF MOTION FOR HEADS, EYEBALLS")
        
        # reset
        self.all_center()

        # head movements
        print("TESTING HEAD MVMT: L, C, R, C")
        self.head_left()
        self.all_center()
        self.head_right()
        self.all_center()

        # BEWARE: these are tough on the motors
        # self.head_up()
        # self.all_center()
        # self.head_down()
        # self.all_center()

        # eyeball movements
        print("TESTING EYEBALL MVMT: L, C, R, C")
        self.eyes_left()
        self.all_center()
        self.eyes_right()
        self.all_center()

        print("TEST DONE.")

if __name__ == "__main__":
    # this block runs if execute this file directly ??
    bot = RobotHead()
    
    try:
        user_input = input("Press ENTER to start the range of motion test or 'q' to quit: ")
        if user_input.lower() != 'q':
            bot.test_full_range_of_motion()
    except KeyboardInterrupt:
        print("\nSTOPPING TEST")
        bot.motors.disable_torque("all") # let bot relax when quit, DO NOT USE WHEN PORT OVER TO FLASK APP?